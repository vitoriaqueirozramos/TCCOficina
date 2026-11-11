const express = require('express');
const { getPool } = require('../config/database');
const { authenticate } = require('../middleware/auth.middleware');
const { lockPartWithBalance } = require('../utils/estoque');

const router = express.Router();
const STATUS_TRANSITIONS = {
  ABERTA: ['EM_DIAGNOSTICO', 'CANCELADA'],
  EM_DIAGNOSTICO: ['AGUARDANDO_APROVACAO', 'AGUARDANDO_PECAS', 'EM_EXECUCAO', 'CANCELADA'],
  AGUARDANDO_APROVACAO: ['AGUARDANDO_PECAS', 'EM_EXECUCAO', 'CANCELADA'],
  AGUARDANDO_PECAS: ['EM_EXECUCAO', 'CANCELADA'],
  EM_EXECUCAO: ['AGUARDANDO_PECAS', 'CONCLUIDA', 'CANCELADA'],
  CONCLUIDA: [],
  CANCELADA: []
};

function requireOrderAccess(request, response, next) {
  const allowedProfiles = ['ADMINISTRADOR', 'ATENDENTE'];
  if (!request.user) {
    return response.status(401).json({ error: 'Autenticação necessária.' });
  }

  if (!allowedProfiles.includes(request.user.perfil)) {
    return response.status(403).json({ error: 'Acesso não autorizado.' });
  }

  return next();
}

function requireMechanicProfile(request, response, next) {
  if (!request.user) {
    return response.status(401).json({ error: 'Autenticação necessária.' });
  }
  if (request.user.perfil !== 'MECANICO') {
    return response.status(403).json({ error: 'Acesso exclusivo para mecânicos.' });
  }
  return next();
}

const CLOSED_STATUSES = ['CONCLUIDA', 'CANCELADA'];

// Uma linha do histórico com o mesmo status antes e depois registra troca de responsável.
function withHistoryType(row) {
  const responsavel = row.id_status_anterior !== null && Number(row.id_status_anterior) === Number(row.id_status_novo);
  return { ...row, tipo: responsavel ? 'RESPONSAVEL' : 'STATUS' };
}

async function loadHistory(executor, idOs) {
  const [rows] = await executor.execute(
    `SELECT hs.id_historico_status,
            hs.id_os,
            hs.id_status_anterior,
            sa.nome AS status_anterior_nome,
            hs.id_status_novo,
            sn.nome AS status_novo_nome,
            sn.codigo AS status_novo_codigo,
            hs.alterado_por,
            ua.nome AS alterado_por_nome,
            hs.alterado_em,
            hs.observacao
     FROM historico_status_os AS hs
     LEFT JOIN status_os AS sa ON sa.id_status_os = hs.id_status_anterior
     JOIN status_os AS sn ON sn.id_status_os = hs.id_status_novo
     JOIN usuarios AS ua ON ua.id_usuario = hs.alterado_por
     WHERE hs.id_os = ?
     ORDER BY hs.alterado_em DESC, hs.id_historico_status DESC`,
    [idOs]
  );
  return rows.map(withHistoryType);
}

// Só mecânicos existentes e ativos podem receber ordens.
async function checkAssignableMechanic(executor, idMecanico) {
  const [rows] = await executor.execute(
    `SELECT m.id_mecanico, m.ativo, u.nome
     FROM mecanicos AS m JOIN usuarios AS u ON u.id_usuario = m.id_usuario
     WHERE m.id_mecanico = ? LIMIT 1`,
    [idMecanico]
  );
  if (rows.length === 0) {
    return { status: 400, error: 'O mecânico informado não existe.' };
  }
  if (!rows[0].ativo) {
    return { status: 409, error: `${rows[0].nome} está inativo e não pode receber ordens de serviço.` };
  }
  return { mecanico: rows[0] };
}

async function loadStatusCatalog(executor) {
  const [rows] = await executor.execute('SELECT id_status_os, codigo, nome FROM status_os ORDER BY id_status_os');
  return rows;
}

function transitionsFor(statusCatalog, currentCode) {
  const allowed = STATUS_TRANSITIONS[currentCode] || [];
  return statusCatalog.filter((status) => allowed.includes(status.codigo));
}

function toMysqlDateTime(value) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString().slice(0, 19).replace('T', ' ');
}

router.get('/minhas', authenticate, requireMechanicProfile, async (request, response, next) => {
  try {
    const [rows] = await getPool().execute(
      `SELECT os.id_os,
              c.nome AS cliente_nome,
              v.placa AS veiculo_placa,
              v.marca AS veiculo_marca,
              v.modelo AS veiculo_modelo,
              os.id_status_os,
              status_os.codigo AS status_codigo,
              status_os.nome AS status_nome,
              os.aberta_em,
              os.previsao_conclusao,
              os.quilometragem_entrada,
              os.diagnostico,
              os.observacoes
       FROM ordens_servico AS os
       JOIN mecanicos AS m ON m.id_mecanico = os.id_mecanico AND m.ativo = TRUE
       JOIN clientes AS c ON c.id_cliente = os.id_cliente
       JOIN veiculos AS v ON v.id_veiculo = os.id_veiculo
       JOIN status_os ON status_os.id_status_os = os.id_status_os
       WHERE m.id_usuario = ?
         AND status_os.codigo NOT IN ('CONCLUIDA', 'CANCELADA')
       ORDER BY os.previsao_conclusao IS NULL, os.previsao_conclusao ASC, os.aberta_em ASC`,
      [request.user.id_usuario]
    );

    const [statusRows] = await getPool().execute(
      `SELECT id_status_os, codigo, nome FROM status_os
       WHERE codigo IN ('EM_DIAGNOSTICO', 'AGUARDANDO_PECAS', 'EM_EXECUCAO')`
    );
    const statusesByCode = new Map(statusRows.map((status) => [status.codigo, status]));
    const ordens = rows.map((ordem) => ({
      ...ordem,
      transicoes: (STATUS_TRANSITIONS[ordem.status_codigo] || [])
        .filter((codigo) => statusesByCode.has(codigo))
        .map((codigo) => {
          const status = statusesByCode.get(codigo);
          return { id_status_os: status.id_status_os, codigo: status.codigo, nome: status.nome };
        })
    }));
    return response.json({ ordens });
  } catch (error) {
    return next(error);
  }
});

router.post('/:id_os/meu-status', authenticate, requireMechanicProfile, async (request, response, next) => {
  let connection;
  try {
    const idOs = Number(request.params.id_os);
    const novoStatusId = Number(request.body?.id_status_os);
    const observacao = typeof request.body?.observacao === 'string' ? request.body.observacao.trim() : null;
    if (!Number.isInteger(idOs) || idOs <= 0 || !Number.isInteger(novoStatusId) || novoStatusId <= 0) {
      return response.status(400).json({ error: 'Informe uma ordem e um status válidos.' });
    }

    connection = await getPool().getConnection();
    await connection.beginTransaction();
    const [orderRows] = await connection.execute(
      `SELECT os.id_status_os, status_os.codigo AS status_codigo, m.id_usuario AS mecanico_usuario_id
       FROM ordens_servico AS os
       JOIN status_os ON status_os.id_status_os = os.id_status_os
       LEFT JOIN mecanicos AS m ON m.id_mecanico = os.id_mecanico
       WHERE os.id_os = ? LIMIT 1 FOR UPDATE`,
      [idOs]
    );
    if (orderRows.length === 0) {
      await connection.rollback();
      return response.status(404).json({ error: 'Ordem de serviço não encontrada.' });
    }
    if (Number(orderRows[0].mecanico_usuario_id) !== Number(request.user.id_usuario)) {
      await connection.rollback();
      return response.status(403).json({ error: 'Esta ordem não está atribuída a este mecânico.' });
    }

    const [targetRows] = await connection.execute(
      'SELECT id_status_os, codigo, nome FROM status_os WHERE id_status_os = ? LIMIT 1',
      [novoStatusId]
    );
    if (targetRows.length === 0) {
      await connection.rollback();
      return response.status(404).json({ error: 'Status não encontrado.' });
    }
    const currentCode = orderRows[0].status_codigo;
    const targetCode = targetRows[0].codigo;
    const mechanicStatuses = ['EM_DIAGNOSTICO', 'AGUARDANDO_PECAS', 'EM_EXECUCAO'];
    if (!mechanicStatuses.includes(targetCode) || !(STATUS_TRANSITIONS[currentCode] || []).includes(targetCode)) {
      await connection.rollback();
      return response.status(409).json({ error: 'Transição não permitida para o perfil de mecânico.' });
    }

    await connection.execute('UPDATE ordens_servico SET id_status_os = ? WHERE id_os = ?', [novoStatusId, idOs]);
    await connection.execute(
      `INSERT INTO historico_status_os (id_os, id_status_anterior, id_status_novo, alterado_por, observacao)
       VALUES (?, ?, ?, ?, ?)`,
      [idOs, orderRows[0].id_status_os, novoStatusId, request.user.id_usuario, observacao || null]
    );
    await connection.commit();
    return response.json({ ordem: { id_os: idOs, id_status_os: novoStatusId, status_codigo: targetCode, status_nome: targetRows[0].nome } });
  } catch (error) {
    if (connection) await connection.rollback();
    return next(error);
  } finally {
    connection?.release();
  }
});

router.use(authenticate, requireOrderAccess);

// Catálogo de status e transições permitidas, para a interface não depender de IDs fixos.
router.get('/status', async (_request, response, next) => {
  try {
    const catalog = await loadStatusCatalog(getPool());
    response.json({
      status: catalog.map((status) => ({
        ...status,
        transicoes: transitionsFor(catalog, status.codigo).map((target) => target.id_status_os)
      }))
    });
  } catch (error) {
    next(error);
  }
});

router.get('/', async (request, response, next) => {
  try {
    const filters = [];
    const params = [];
    const statusCode = typeof request.query.status === 'string' ? request.query.status.trim().toUpperCase() : '';
    if (statusCode) {
      filters.push('status_os.codigo = ?');
      params.push(statusCode);
    }
    const mechanicFilter = typeof request.query.id_mecanico === 'string' ? request.query.id_mecanico.trim() : '';
    if (mechanicFilter === 'nenhum') {
      filters.push('os.id_mecanico IS NULL');
    } else if (mechanicFilter) {
      const idMecanico = Number(mechanicFilter);
      if (!Number.isInteger(idMecanico) || idMecanico <= 0) {
        return response.status(400).json({ error: 'Informe um mecânico válido.' });
      }
      filters.push('os.id_mecanico = ?');
      params.push(idMecanico);
    }
    const search = typeof request.query.q === 'string' ? request.query.q.trim() : '';
    if (search) {
      filters.push('(c.nome LIKE ? OR v.placa LIKE ? OR CAST(os.id_os AS CHAR) = ?)');
      params.push(`%${search}%`, `%${search}%`, search.replace(/^#/, ''));
    }
    let limitClause = '';
    if (request.query.limit !== undefined) {
      const limit = Number(request.query.limit);
      if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
        return response.status(400).json({ error: 'Informe um limite entre 1 e 500.' });
      }
      limitClause = 'LIMIT ?';
      params.push(limit);
    }
    const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

    const [rows] = await getPool().execute(
      `SELECT os.id_os,
              os.id_cliente,
              c.nome AS cliente_nome,
              os.id_veiculo,
              v.placa AS veiculo_placa,
              v.marca AS veiculo_marca,
              v.modelo AS veiculo_modelo,
              os.id_mecanico,
              u_mec.nome AS mecanico_nome,
              os.id_status_os,
              status_os.codigo AS status_codigo,
              status_os.nome AS status_nome,
              os.aberta_por,
              u_ab.nome AS aberta_por_nome,
              os.aberta_em,
              os.previsao_conclusao,
              os.concluida_em,
              os.quilometragem_entrada,
              os.diagnostico,
              os.observacoes,
              COALESCE((SELECT SUM(item.quantidade * item.valor_unitario)
                        FROM os_servicos AS item WHERE item.id_os = os.id_os AND item.removida_em IS NULL), 0) +
              COALESCE((SELECT SUM(item.quantidade * item.valor_unitario)
                        FROM os_pecas AS item WHERE item.id_os = os.id_os AND item.removida_em IS NULL), 0) AS valor_total
       FROM ordens_servico AS os
       JOIN clientes AS c ON c.id_cliente = os.id_cliente
       JOIN veiculos AS v ON v.id_veiculo = os.id_veiculo
       JOIN status_os ON status_os.id_status_os = os.id_status_os
       JOIN usuarios AS u_ab ON u_ab.id_usuario = os.aberta_por
       LEFT JOIN mecanicos AS m ON m.id_mecanico = os.id_mecanico
       LEFT JOIN usuarios AS u_mec ON u_mec.id_usuario = m.id_usuario
       ${whereClause}
       ORDER BY os.aberta_em DESC, os.id_os DESC
       ${limitClause}`,
      params
    );

    return response.json({ ordens: rows });
  } catch (error) {
    return next(error);
  }
});

router.get('/:id_os', async (request, response, next) => {
  try {
    const idOs = Number(request.params.id_os);
    if (!Number.isInteger(idOs) || idOs <= 0) {
      return response.status(400).json({ error: 'Informe uma ordem de serviço válida.' });
    }

    const [rows] = await getPool().execute(
      `SELECT os.id_os,
              os.id_cliente,
              c.nome AS cliente_nome,
              os.id_veiculo,
              v.placa AS veiculo_placa,
              v.marca AS veiculo_marca,
              v.modelo AS veiculo_modelo,
              os.id_mecanico,
              u_mec.nome AS mecanico_nome,
              os.id_status_os,
              status_os.codigo AS status_codigo,
              status_os.nome AS status_nome,
              os.aberta_por,
              u_ab.nome AS aberta_por_nome,
              os.aberta_em,
              os.previsao_conclusao,
              os.concluida_em,
              os.quilometragem_entrada,
              os.diagnostico,
              os.observacoes,
              COALESCE((SELECT SUM(item.quantidade * item.valor_unitario)
                        FROM os_servicos AS item WHERE item.id_os = os.id_os AND item.removida_em IS NULL), 0) +
              COALESCE((SELECT SUM(item.quantidade * item.valor_unitario)
                        FROM os_pecas AS item WHERE item.id_os = os.id_os AND item.removida_em IS NULL), 0) AS valor_total
       FROM ordens_servico AS os
       JOIN clientes AS c ON c.id_cliente = os.id_cliente
       JOIN veiculos AS v ON v.id_veiculo = os.id_veiculo
       JOIN status_os ON status_os.id_status_os = os.id_status_os
       JOIN usuarios AS u_ab ON u_ab.id_usuario = os.aberta_por
       LEFT JOIN mecanicos AS m ON m.id_mecanico = os.id_mecanico
       LEFT JOIN usuarios AS u_mec ON u_mec.id_usuario = m.id_usuario
       WHERE os.id_os = ?
       LIMIT 1`,
      [idOs]
    );

    if (rows.length === 0) {
      return response.status(404).json({ error: 'Ordem de serviço não encontrada.' });
    }

    const transicoes = transitionsFor(await loadStatusCatalog(getPool()), rows[0].status_codigo);
    return response.json({ ordem: rows[0], transicoes });
  } catch (error) {
    return next(error);
  }
});

router.post('/', async (request, response, next) => {
  const idCliente = Number(request.body?.id_cliente);
  const idVeiculo = Number(request.body?.id_veiculo);
  const idMecanico = request.body?.id_mecanico !== undefined && request.body?.id_mecanico !== null
    ? Number(request.body.id_mecanico)
    : null;
  const idStatus = request.body?.id_status_os !== undefined && request.body?.id_status_os !== null
    ? Number(request.body.id_status_os)
    : null;
  const quilometragemEntrada = request.body?.quilometragem_entrada !== undefined && request.body?.quilometragem_entrada !== null
    ? Number(request.body.quilometragem_entrada)
    : null;
  const diagnostico = typeof request.body?.diagnostico === 'string' ? request.body.diagnostico.trim() : null;
  const observacoes = typeof request.body?.observacoes === 'string' ? request.body.observacoes.trim() : null;
  const previsaoConclusao = toMysqlDateTime(request.body?.previsao_conclusao);

  if (!Number.isInteger(idCliente) || idCliente <= 0) {
    return response.status(400).json({ error: 'Informe um cliente válido.' });
  }

  if (!Number.isInteger(idVeiculo) || idVeiculo <= 0) {
    return response.status(400).json({ error: 'Informe um veículo válido.' });
  }

  if (idMecanico !== null && (!Number.isInteger(idMecanico) || idMecanico <= 0)) {
    return response.status(400).json({ error: 'Informe um mecânico válido.' });
  }

  if (idStatus !== null && (!Number.isInteger(idStatus) || idStatus <= 0)) {
    return response.status(400).json({ error: 'Informe um status válido.' });
  }

  if (quilometragemEntrada !== null && (!Number.isInteger(quilometragemEntrada) || quilometragemEntrada < 0)) {
    return response.status(400).json({ error: 'Informe uma quilometragem válida.' });
  }

  let connection;
  try {
    connection = await getPool().getConnection();
    await connection.beginTransaction();
    const fail = async (status, error) => {
      await connection.rollback();
      return response.status(status).json({ error });
    };

    const [statusRows] = await connection.execute(
      'SELECT id_status_os FROM status_os WHERE codigo = ? LIMIT 1',
      ['ABERTA']
    );
    if (statusRows.length === 0) {
      return fail(500, 'Status inicial da OS não foi encontrado.');
    }
    const resolvedStatusId = statusRows[0].id_status_os;
    if (idStatus !== null && idStatus !== resolvedStatusId) {
      return fail(400, 'Uma nova ordem deve iniciar no status Aberta.');
    }

    const [clientRows] = await connection.execute('SELECT ativo FROM clientes WHERE id_cliente = ? LIMIT 1', [idCliente]);
    if (clientRows.length === 0) {
      return fail(400, 'O cliente informado não existe.');
    }
    if (!clientRows[0].ativo) {
      return fail(409, 'Cliente inativo não pode abrir novas ordens de serviço.');
    }

    // O navegador já filtra os veículos pelo cliente; a regra é conferida de novo aqui.
    const [vehicleRows] = await connection.execute('SELECT id_cliente, ativo, placa FROM veiculos WHERE id_veiculo = ? LIMIT 1', [idVeiculo]);
    if (vehicleRows.length === 0) {
      return fail(400, 'O veículo informado não existe.');
    }
    if (Number(vehicleRows[0].id_cliente) !== idCliente) {
      return fail(409, `O veículo ${vehicleRows[0].placa} não pertence ao cliente selecionado.`);
    }
    if (!vehicleRows[0].ativo) {
      return fail(409, 'Veículo inativo não pode receber novas ordens de serviço.');
    }

    if (idMecanico !== null) {
      const check = await checkAssignableMechanic(connection, idMecanico);
      if (check.error) {
        return fail(check.status, check.error);
      }
    }

    const [result] = await connection.execute(
      `INSERT INTO ordens_servico (
        id_cliente, id_veiculo, id_mecanico, id_status_os, aberta_por,
        previsao_conclusao, quilometragem_entrada, diagnostico, observacoes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        idCliente,
        idVeiculo,
        idMecanico,
        resolvedStatusId,
        request.user.id_usuario,
        previsaoConclusao,
        quilometragemEntrada,
        diagnostico || null,
        observacoes || null
      ]
    );
    await connection.execute(
      `INSERT INTO historico_status_os (id_os, id_status_anterior, id_status_novo, alterado_por, observacao)
       VALUES (?, NULL, ?, ?, 'Ordem de serviço aberta.')`,
      [result.insertId, resolvedStatusId, request.user.id_usuario]
    );

    const [rows] = await connection.execute(
      `SELECT os.id_os,
              os.id_cliente,
              c.nome AS cliente_nome,
              os.id_veiculo,
              v.placa AS veiculo_placa,
              v.marca AS veiculo_marca,
              v.modelo AS veiculo_modelo,
              os.id_mecanico,
              u_mec.nome AS mecanico_nome,
              os.id_status_os,
              status_os.codigo AS status_codigo,
              status_os.nome AS status_nome,
              os.aberta_por,
              u_ab.nome AS aberta_por_nome,
              os.aberta_em,
              os.previsao_conclusao,
              os.concluida_em,
              os.quilometragem_entrada,
              os.diagnostico,
              os.observacoes
       FROM ordens_servico AS os
       JOIN clientes AS c ON c.id_cliente = os.id_cliente
       JOIN veiculos AS v ON v.id_veiculo = os.id_veiculo
       JOIN status_os ON status_os.id_status_os = os.id_status_os
       JOIN usuarios AS u_ab ON u_ab.id_usuario = os.aberta_por
       LEFT JOIN mecanicos AS m ON m.id_mecanico = os.id_mecanico
       LEFT JOIN usuarios AS u_mec ON u_mec.id_usuario = m.id_usuario
       WHERE os.id_os = ?
       LIMIT 1`,
      [result.insertId]
    );

    await connection.commit();
    return response.status(201).json({ ordem: rows[0] });
  } catch (error) {
    if (connection) await connection.rollback();
    return next(error);
  } finally {
    connection?.release();
  }
});

// Define, troca ou remove o mecânico responsável por uma ordem em andamento.
router.patch('/:id_os/mecanico', async (request, response, next) => {
  let connection;
  try {
    const idOs = Number(request.params.id_os);
    const raw = request.body?.id_mecanico;
    const idMecanico = raw === null || raw === '' ? null : Number(raw);
    const observacao = typeof request.body?.observacao === 'string' ? request.body.observacao.trim() : '';

    if (!Number.isInteger(idOs) || idOs <= 0) {
      return response.status(400).json({ error: 'Informe uma ordem de serviço válida.' });
    }
    if (raw === undefined || (idMecanico !== null && (!Number.isInteger(idMecanico) || idMecanico <= 0))) {
      return response.status(400).json({ error: 'Informe um mecânico válido ou null para deixar a ordem sem responsável.' });
    }
    if (observacao.length > 120) {
      return response.status(400).json({ error: 'A observação deve ter até 120 caracteres.' });
    }

    connection = await getPool().getConnection();
    await connection.beginTransaction();
    const fail = async (status, error) => {
      await connection.rollback();
      return response.status(status).json({ error });
    };

    const [orderRows] = await connection.execute(
      `SELECT os.id_mecanico, os.id_status_os, status_os.codigo AS status_codigo, u.nome AS mecanico_nome
       FROM ordens_servico AS os
       JOIN status_os ON status_os.id_status_os = os.id_status_os
       LEFT JOIN mecanicos AS m ON m.id_mecanico = os.id_mecanico
       LEFT JOIN usuarios AS u ON u.id_usuario = m.id_usuario
       WHERE os.id_os = ? LIMIT 1 FOR UPDATE`,
      [idOs]
    );
    if (orderRows.length === 0) {
      return fail(404, 'Ordem de serviço não encontrada.');
    }
    const order = orderRows[0];
    if (CLOSED_STATUSES.includes(order.status_codigo)) {
      return fail(409, 'Não é possível alterar o responsável de uma ordem encerrada.');
    }
    const atual = order.id_mecanico === null ? null : Number(order.id_mecanico);
    if (atual === idMecanico) {
      return fail(409, idMecanico === null ? 'A ordem já está sem responsável.' : 'A ordem já está atribuída a este mecânico.');
    }

    let novoNome = null;
    if (idMecanico !== null) {
      const check = await checkAssignableMechanic(connection, idMecanico);
      if (check.error) {
        return fail(check.status, check.error);
      }
      novoNome = check.mecanico.nome;
    }

    await connection.execute('UPDATE ordens_servico SET id_mecanico = ? WHERE id_os = ?', [idMecanico, idOs]);
    let descricao;
    if (atual === null) descricao = `Responsável definido: ${novoNome}.`;
    else if (idMecanico === null) descricao = `Responsável removido (antes: ${order.mecanico_nome}).`;
    else descricao = `Responsável alterado: ${order.mecanico_nome} → ${novoNome}.`;
    await connection.execute(
      `INSERT INTO historico_status_os (id_os, id_status_anterior, id_status_novo, alterado_por, observacao)
       VALUES (?, ?, ?, ?, ?)`,
      [idOs, order.id_status_os, order.id_status_os, request.user.id_usuario, observacao ? `${descricao} ${observacao}` : descricao]
    );

    const historico = await loadHistory(connection, idOs);
    await connection.commit();
    return response.json({
      ordem: { id_os: idOs, id_mecanico: idMecanico, mecanico_nome: novoNome },
      historico,
      message: descricao
    });
  } catch (error) {
    if (connection) await connection.rollback();
    return next(error);
  } finally {
    connection?.release();
  }
});

router.get('/:id_os/historico-status', async (request, response, next) => {
  try {
    const idOs = Number(request.params.id_os);
    if (!Number.isInteger(idOs) || idOs <= 0) {
      return response.status(400).json({ error: 'Informe uma ordem de serviço válida.' });
    }

    const [orderRows] = await getPool().execute('SELECT id_os FROM ordens_servico WHERE id_os = ? LIMIT 1', [idOs]);
    if (orderRows.length === 0) {
      return response.status(404).json({ error: 'Ordem de serviço não encontrada.' });
    }

    return response.json({ historico: await loadHistory(getPool(), idOs) });
  } catch (error) {
    return next(error);
  }
});

router.post('/:id_os/status', async (request, response, next) => {
  let connection;
  try {
    const idOs = Number(request.params.id_os);
    const novoStatusId = Number(request.body?.id_status_os);
    const observacao = typeof request.body?.observacao === 'string' ? request.body.observacao.trim() : null;

    if (!Number.isInteger(idOs) || idOs <= 0) {
      return response.status(400).json({ error: 'Informe uma ordem de serviço válida.' });
    }

    if (!Number.isInteger(novoStatusId) || novoStatusId <= 0) {
      return response.status(400).json({ error: 'Informe um status válido.' });
    }

    connection = await getPool().getConnection();
    await connection.beginTransaction();

    const [orderRows] = await connection.execute(
      `SELECT os.id_status_os, status_os.codigo AS status_codigo
       FROM ordens_servico AS os
       JOIN status_os ON status_os.id_status_os = os.id_status_os
       WHERE os.id_os = ?
       LIMIT 1 FOR UPDATE`,
      [idOs]
    );

    if (orderRows.length === 0) {
      await connection.rollback();
      return response.status(404).json({ error: 'Ordem de serviço não encontrada.' });
    }

    const statusAtualId = Number(orderRows[0].id_status_os);
    const statusAtualCodigo = orderRows[0].status_codigo;
    if (statusAtualId === novoStatusId) {
      await connection.rollback();
      return response.status(400).json({ error: 'A ordem já está neste status.' });
    }

    const [statusRows] = await connection.execute(
      'SELECT id_status_os, codigo FROM status_os WHERE id_status_os = ? LIMIT 1',
      [novoStatusId]
    );

    if (statusRows.length === 0) {
      await connection.rollback();
      return response.status(404).json({ error: 'Status não encontrado.' });
    }

    const statusNovoCodigo = statusRows[0].codigo;
    if (!STATUS_TRANSITIONS[statusAtualCodigo]?.includes(statusNovoCodigo)) {
      await connection.rollback();
      return response.status(409).json({ error: 'Transição de status não permitida para esta ordem.' });
    }

    if (statusNovoCodigo === 'CONCLUIDA') {
      const [itemRows] = await connection.execute(
        `SELECT (SELECT COUNT(*) FROM os_servicos WHERE id_os = ? AND removida_em IS NULL) +
          (SELECT COUNT(*) FROM os_pecas WHERE id_os = ? AND removida_em IS NULL) AS total_itens`,
        [idOs, idOs]
      );
      if (Number(itemRows[0].total_itens) === 0) {
        await connection.rollback();
        return response.status(409).json({ error: 'Adicione ao menos um serviço ou peça antes de concluir a ordem.' });
      }
    }

    await connection.execute(
      `UPDATE ordens_servico
       SET id_status_os = ?,
           concluida_em = CASE WHEN ? = 'CONCLUIDA' THEN NOW() ELSE NULL END
       WHERE id_os = ?`,
      [novoStatusId, statusNovoCodigo, idOs]
    );

    if (statusNovoCodigo === 'CANCELADA') {
      const [partRows] = await connection.execute(
        'SELECT id_os_peca, id_peca, quantidade FROM os_pecas WHERE id_os = ? AND removida_em IS NULL',
        [idOs]
      );
      for (const part of partRows) {
        await connection.execute(
          `INSERT INTO movimentos_estoque (
            id_peca, id_os_peca, registrado_por, quantidade_delta, motivo, observacao
          ) VALUES (?, ?, ?, ?, 'ESTORNO', ?)`,
          [part.id_peca, part.id_os_peca, request.user.id_usuario, Number(part.quantidade), `Estorno por cancelamento da OS ${idOs}`]
        );
      }
    }

    const [historyResult] = await connection.execute(
      `INSERT INTO historico_status_os (id_os, id_status_anterior, id_status_novo, alterado_por, observacao)
       VALUES (?, ?, ?, ?, ?)`,
      [idOs, statusAtualId, novoStatusId, request.user.id_usuario, observacao || null]
    );

    const [rows] = await connection.execute(
      `SELECT os.id_os,
              os.id_cliente,
              c.nome AS cliente_nome,
              os.id_veiculo,
              v.placa AS veiculo_placa,
              v.marca AS veiculo_marca,
              v.modelo AS veiculo_modelo,
              os.id_mecanico,
              u_mec.nome AS mecanico_nome,
              os.id_status_os,
              status_os.codigo AS status_codigo,
              status_os.nome AS status_nome,
              os.aberta_por,
              u_ab.nome AS aberta_por_nome,
              os.aberta_em,
              os.previsao_conclusao,
              os.concluida_em,
              os.quilometragem_entrada,
              os.diagnostico,
              os.observacoes
       FROM ordens_servico AS os
       JOIN clientes AS c ON c.id_cliente = os.id_cliente
       JOIN veiculos AS v ON v.id_veiculo = os.id_veiculo
       JOIN status_os ON status_os.id_status_os = os.id_status_os
       JOIN usuarios AS u_ab ON u_ab.id_usuario = os.aberta_por
       LEFT JOIN mecanicos AS m ON m.id_mecanico = os.id_mecanico
       LEFT JOIN usuarios AS u_mec ON u_mec.id_usuario = m.id_usuario
       WHERE os.id_os = ?
       LIMIT 1`,
      [idOs]
    );

    const historicoRows = await loadHistory(connection, idOs);
    const transicoes = transitionsFor(await loadStatusCatalog(connection), statusNovoCodigo);

    await connection.commit();
    return response.json({ ordem: rows[0], historico: historicoRows, transicoes, ultimo_historico_id: historyResult.insertId });
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    return next(error);
  } finally {
    connection?.release();
  }
});

router.get('/:id_os/os-servicos', async (request, response, next) => {
  try {
    const idOs = Number(request.params.id_os);
    if (!Number.isInteger(idOs) || idOs <= 0) {
      return response.status(400).json({ error: 'Informe uma ordem de serviço válida.' });
    }

    const [orderRows] = await getPool().execute('SELECT id_os FROM ordens_servico WHERE id_os = ? LIMIT 1', [idOs]);
    if (orderRows.length === 0) {
      return response.status(404).json({ error: 'Ordem de serviço não encontrada.' });
    }

    const [rows] = await getPool().execute(
      `SELECT os.id_os_servico,
              os.id_os,
              os.id_servico,
              s.nome AS servico_nome,
              os.descricao_snapshot,
              os.quantidade,
              os.valor_unitario
       FROM os_servicos AS os
       JOIN servicos AS s ON s.id_servico = os.id_servico
      WHERE os.id_os = ? AND os.removida_em IS NULL
       ORDER BY os.id_os_servico ASC`,
      [idOs]
    );

    return response.json({ itens: rows });
  } catch (error) {
    return next(error);
  }
});

router.post('/:id_os/os-servicos', async (request, response, next) => {
  let connection;
  try {
    const idOs = Number(request.params.id_os);
    const idServico = Number(request.body?.id_servico);
    const descricaoSnapshot = typeof request.body?.descricao_snapshot === 'string' ? request.body.descricao_snapshot.trim() : '';
    const quantidade = Number(request.body?.quantidade);
    const valorUnitario = Number(request.body?.valor_unitario);

    if (!Number.isInteger(idOs) || idOs <= 0) {
      return response.status(400).json({ error: 'Informe uma ordem de serviço válida.' });
    }

    if (!Number.isInteger(idServico) || idServico <= 0) {
      return response.status(400).json({ error: 'Informe um serviço válido.' });
    }

    if (!descricaoSnapshot) {
      return response.status(400).json({ error: 'Informe a descrição do serviço.' });
    }

    if (!Number.isFinite(quantidade) || quantidade <= 0) {
      return response.status(400).json({ error: 'Informe uma quantidade maior que zero.' });
    }

    if (!Number.isFinite(valorUnitario) || valorUnitario < 0) {
      return response.status(400).json({ error: 'Informe um valor unitário válido.' });
    }

    connection = await getPool().getConnection();
    await connection.beginTransaction();
    const [orderRows] = await connection.execute(
      `SELECT os.id_os, status_os.codigo AS status_codigo
       FROM ordens_servico AS os
       JOIN status_os ON status_os.id_status_os = os.id_status_os
       WHERE os.id_os = ? LIMIT 1 FOR UPDATE`,
      [idOs]
    );
    if (orderRows.length === 0) {
      await connection.rollback();
      return response.status(404).json({ error: 'Ordem de serviço não encontrada.' });
    }
    if (['CONCLUIDA', 'CANCELADA'].includes(orderRows[0].status_codigo)) {
      await connection.rollback();
      return response.status(409).json({ error: 'Não é possível adicionar serviços a uma ordem encerrada.' });
    }

    const [serviceRows] = await connection.execute('SELECT id_servico, ativo FROM servicos WHERE id_servico = ? LIMIT 1', [idServico]);
    if (serviceRows.length === 0) {
      await connection.rollback();
      return response.status(404).json({ error: 'Serviço não encontrado.' });
    }
    if (!serviceRows[0].ativo) {
      await connection.rollback();
      return response.status(409).json({ error: 'Serviço inativo não pode ser adicionado a uma ordem.' });
    }

    const [result] = await connection.execute(
      `INSERT INTO os_servicos (id_os, id_servico, descricao_snapshot, quantidade, valor_unitario)
       VALUES (?, ?, ?, ?, ?)`,
      [idOs, idServico, descricaoSnapshot, quantidade, valorUnitario]
    );

    const [rows] = await connection.execute(
      `SELECT os.id_os_servico,
              os.id_os,
              os.id_servico,
              s.nome AS servico_nome,
              os.descricao_snapshot,
              os.quantidade,
              os.valor_unitario
       FROM os_servicos AS os
       JOIN servicos AS s ON s.id_servico = os.id_servico
       WHERE os.id_os_servico = ?
       LIMIT 1`,
      [result.insertId]
    );

    await connection.commit();
    return response.status(201).json({ item: rows[0] });
  } catch (error) {
    if (connection) await connection.rollback();
    return next(error);
  } finally {
    connection?.release();
  }
});

router.put('/:id_os/os-servicos/:id_os_servico', async (request, response, next) => {
  let connection;
  try {
    const idOs = Number(request.params.id_os);
    const idItem = Number(request.params.id_os_servico);
    const descricao = typeof request.body?.descricao_snapshot === 'string' ? request.body.descricao_snapshot.trim() : '';
    const quantidade = Number(request.body?.quantidade);
    const valorUnitario = Number(request.body?.valor_unitario);
    if (!Number.isInteger(idOs) || idOs <= 0 || !Number.isInteger(idItem) || idItem <= 0 || !descricao || !Number.isFinite(quantidade) || quantidade <= 0 || !Number.isFinite(valorUnitario) || valorUnitario < 0) {
      return response.status(400).json({ error: 'Informe dados válidos para o serviço da ordem.' });
    }

    connection = await getPool().getConnection();
    await connection.beginTransaction();
    const [orderRows] = await connection.execute(
      `SELECT status_os.codigo AS status_codigo FROM ordens_servico AS os
       JOIN status_os ON status_os.id_status_os = os.id_status_os
       WHERE os.id_os = ? LIMIT 1 FOR UPDATE`,
      [idOs]
    );
    if (orderRows.length === 0) {
      await connection.rollback();
      return response.status(404).json({ error: 'Ordem de serviço não encontrada.' });
    }
    if (['CONCLUIDA', 'CANCELADA'].includes(orderRows[0].status_codigo)) {
      await connection.rollback();
      return response.status(409).json({ error: 'Não é possível alterar itens de uma ordem encerrada.' });
    }
    const [itemRows] = await connection.execute(
      'SELECT id_os_servico FROM os_servicos WHERE id_os_servico = ? AND id_os = ? AND removida_em IS NULL LIMIT 1 FOR UPDATE',
      [idItem, idOs]
    );
    if (itemRows.length === 0) {
      await connection.rollback();
      return response.status(404).json({ error: 'Serviço da ordem não encontrado.' });
    }
    await connection.execute(
      'UPDATE os_servicos SET descricao_snapshot = ?, quantidade = ?, valor_unitario = ? WHERE id_os_servico = ?',
      [descricao, quantidade, Number(valorUnitario.toFixed(2)), idItem]
    );
    const [rows] = await connection.execute(
      `SELECT os.id_os_servico, os.id_os, os.id_servico, s.nome AS servico_nome,
              os.descricao_snapshot, os.quantidade, os.valor_unitario
       FROM os_servicos AS os JOIN servicos AS s ON s.id_servico = os.id_servico
       WHERE os.id_os_servico = ?`,
      [idItem]
    );
    await connection.commit();
    return response.json({ item: rows[0] });
  } catch (error) {
    if (connection) await connection.rollback();
    return next(error);
  } finally {
    connection?.release();
  }
});

router.delete('/:id_os/os-servicos/:id_os_servico', async (request, response, next) => {
  let connection;
  try {
    const idOs = Number(request.params.id_os);
    const idItem = Number(request.params.id_os_servico);
    if (!Number.isInteger(idOs) || idOs <= 0 || !Number.isInteger(idItem) || idItem <= 0) {
      return response.status(400).json({ error: 'Informe uma ordem e um serviço válidos.' });
    }
    connection = await getPool().getConnection();
    await connection.beginTransaction();
    const [orderRows] = await connection.execute(
      `SELECT status_os.codigo AS status_codigo FROM ordens_servico AS os
       JOIN status_os ON status_os.id_status_os = os.id_status_os
       WHERE os.id_os = ? LIMIT 1 FOR UPDATE`,
      [idOs]
    );
    if (orderRows.length === 0) {
      await connection.rollback();
      return response.status(404).json({ error: 'Ordem de serviço não encontrada.' });
    }
    if (['CONCLUIDA', 'CANCELADA'].includes(orderRows[0].status_codigo)) {
      await connection.rollback();
      return response.status(409).json({ error: 'Não é possível alterar itens de uma ordem encerrada.' });
    }
    const [result] = await connection.execute(
      'UPDATE os_servicos SET removida_em = NOW() WHERE id_os_servico = ? AND id_os = ? AND removida_em IS NULL',
      [idItem, idOs]
    );
    if (result.affectedRows === 0) {
      await connection.rollback();
      return response.status(404).json({ error: 'Serviço da ordem não encontrado.' });
    }
    await connection.commit();
    return response.status(204).end();
  } catch (error) {
    if (connection) await connection.rollback();
    return next(error);
  } finally {
    connection?.release();
  }
});

router.get('/:id_os/os-pecas', async (request, response, next) => {
  try {
    const idOs = Number(request.params.id_os);
    if (!Number.isInteger(idOs) || idOs <= 0) {
      return response.status(400).json({ error: 'Informe uma ordem de serviço válida.' });
    }

    const [orderRows] = await getPool().execute('SELECT id_os FROM ordens_servico WHERE id_os = ? LIMIT 1', [idOs]);
    if (orderRows.length === 0) {
      return response.status(404).json({ error: 'Ordem de serviço não encontrada.' });
    }

    const [rows] = await getPool().execute(
      `SELECT op.id_os_peca,
              op.id_os,
              op.id_peca,
              p.nome AS peca_nome,
              p.codigo AS peca_codigo,
              op.descricao_snapshot,
              op.quantidade,
              op.valor_unitario
       FROM os_pecas AS op
       JOIN pecas AS p ON p.id_peca = op.id_peca
      WHERE op.id_os = ? AND op.removida_em IS NULL
       ORDER BY op.id_os_peca ASC`,
      [idOs]
    );

    return response.json({ itens: rows });
  } catch (error) {
    return next(error);
  }
});

router.post('/:id_os/os-pecas', async (request, response, next) => {
  let connection;
  try {
    const idOs = Number(request.params.id_os);
    const idPeca = Number(request.body?.id_peca);
    const descricaoSnapshot = typeof request.body?.descricao_snapshot === 'string' ? request.body.descricao_snapshot.trim() : '';
    const quantidade = Number(request.body?.quantidade);
    const valorUnitario = Number(request.body?.valor_unitario);

    if (!Number.isInteger(idOs) || idOs <= 0) {
      return response.status(400).json({ error: 'Informe uma ordem de serviço válida.' });
    }

    if (!Number.isInteger(idPeca) || idPeca <= 0) {
      return response.status(400).json({ error: 'Informe uma peça válida.' });
    }

    if (!descricaoSnapshot) {
      return response.status(400).json({ error: 'Informe a descrição da peça.' });
    }

    if (!Number.isInteger(quantidade) || quantidade <= 0) {
      return response.status(400).json({ error: 'Informe uma quantidade inteira maior que zero.' });
    }

    if (!Number.isFinite(valorUnitario) || valorUnitario < 0) {
      return response.status(400).json({ error: 'Informe um valor unitário válido.' });
    }

    connection = await getPool().getConnection();
    await connection.beginTransaction();

    const [orderRows] = await connection.execute(
      `SELECT os.id_os, status_os.codigo AS status_codigo
       FROM ordens_servico AS os
       JOIN status_os ON status_os.id_status_os = os.id_status_os
       WHERE os.id_os = ?
       LIMIT 1 FOR UPDATE`,
      [idOs]
    );
    if (orderRows.length === 0) {
      await connection.rollback();
      return response.status(404).json({ error: 'Ordem de serviço não encontrada.' });
    }
    if (['CONCLUIDA', 'CANCELADA'].includes(orderRows[0].status_codigo)) {
      await connection.rollback();
      return response.status(409).json({ error: 'Não é possível adicionar peças a uma ordem encerrada.' });
    }

    const part = await lockPartWithBalance(connection, idPeca);
    if (!part) {
      await connection.rollback();
      return response.status(404).json({ error: 'Peça não encontrada.' });
    }
    if (!part.ativo) {
      await connection.rollback();
      return response.status(409).json({ error: 'Peça inativa não pode ser adicionada a uma ordem.' });
    }

    const saldoAtual = part.saldo_atual;
    if (saldoAtual < quantidade) {
      await connection.rollback();
      return response.status(409).json({
        error: 'Estoque insuficiente para adicionar esta peça à ordem.',
        saldo_disponivel: saldoAtual
      });
    }

    const [result] = await connection.execute(
      `INSERT INTO os_pecas (id_os, id_peca, descricao_snapshot, quantidade, valor_unitario)
       VALUES (?, ?, ?, ?, ?)`,
      [idOs, idPeca, descricaoSnapshot, quantidade, valorUnitario]
    );

    await connection.execute(
      `INSERT INTO movimentos_estoque (
        id_peca, id_os_peca, registrado_por, quantidade_delta, motivo, observacao
      ) VALUES (?, ?, ?, ?, 'CONSUMO_OS', ?)` ,
      [idPeca, result.insertId, request.user.id_usuario, -quantidade, `Consumo na OS ${idOs}`]
    );

    const [rows] = await connection.execute(
      `SELECT op.id_os_peca,
              op.id_os,
              op.id_peca,
              p.nome AS peca_nome,
              p.codigo AS peca_codigo,
              op.descricao_snapshot,
              op.quantidade,
              op.valor_unitario
       FROM os_pecas AS op
       JOIN pecas AS p ON p.id_peca = op.id_peca
       WHERE op.id_os_peca = ?
       LIMIT 1`,
      [result.insertId]
    );

    await connection.commit();
    return response.status(201).json({ item: rows[0] });
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    return next(error);
  } finally {
    connection?.release();
  }
});

router.put('/:id_os/os-pecas/:id_os_peca', async (request, response, next) => {
  let connection;
  try {
    const idOs = Number(request.params.id_os);
    const idItem = Number(request.params.id_os_peca);
    const descricao = typeof request.body?.descricao_snapshot === 'string' ? request.body.descricao_snapshot.trim() : '';
    const quantidade = Number(request.body?.quantidade);
    const valorUnitario = Number(request.body?.valor_unitario);
    if (!Number.isInteger(idOs) || idOs <= 0 || !Number.isInteger(idItem) || idItem <= 0 || !descricao || !Number.isInteger(quantidade) || quantidade <= 0 || !Number.isFinite(valorUnitario) || valorUnitario < 0) {
      return response.status(400).json({ error: 'Informe dados válidos para a peça da ordem.' });
    }

    connection = await getPool().getConnection();
    await connection.beginTransaction();
    const [orderRows] = await connection.execute(
      `SELECT status_os.codigo AS status_codigo FROM ordens_servico AS os
       JOIN status_os ON status_os.id_status_os = os.id_status_os
       WHERE os.id_os = ? LIMIT 1 FOR UPDATE`,
      [idOs]
    );
    if (orderRows.length === 0) {
      await connection.rollback();
      return response.status(404).json({ error: 'Ordem de serviço não encontrada.' });
    }
    if (['CONCLUIDA', 'CANCELADA'].includes(orderRows[0].status_codigo)) {
      await connection.rollback();
      return response.status(409).json({ error: 'Não é possível alterar itens de uma ordem encerrada.' });
    }
    const [itemRows] = await connection.execute(
      `SELECT id_peca, quantidade FROM os_pecas
       WHERE id_os_peca = ? AND id_os = ? AND removida_em IS NULL
       LIMIT 1 FOR UPDATE`,
      [idItem, idOs]
    );
    if (itemRows.length === 0) {
      await connection.rollback();
      return response.status(404).json({ error: 'Peça da ordem não encontrada.' });
    }

    const variacao = quantidade - Number(itemRows[0].quantidade);
    if (variacao !== 0) {
      const idPeca = itemRows[0].id_peca;
      const part = await lockPartWithBalance(connection, idPeca);
      if (!part) {
        await connection.rollback();
        return response.status(404).json({ error: 'Peça não encontrada.' });
      }
      if (variacao > 0) {
        if (!part.ativo) {
          await connection.rollback();
          return response.status(409).json({ error: 'Peça inativa: não é possível aumentar a quantidade consumida.' });
        }
        const saldoAtual = part.saldo_atual;
        if (saldoAtual < variacao) {
          await connection.rollback();
          return response.status(409).json({ error: 'Estoque insuficiente para aumentar a quantidade da peça.', saldo_disponivel: saldoAtual });
        }
      }
      await connection.execute(
        `INSERT INTO movimentos_estoque (
          id_peca, id_os_peca, registrado_por, quantidade_delta, motivo, observacao
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        [idPeca, idItem, request.user.id_usuario, -variacao, variacao > 0 ? 'CONSUMO_OS' : 'ESTORNO', `Ajuste de quantidade na OS ${idOs}`]
      );
    }

    await connection.execute(
      'UPDATE os_pecas SET descricao_snapshot = ?, quantidade = ?, valor_unitario = ? WHERE id_os_peca = ?',
      [descricao, quantidade, Number(valorUnitario.toFixed(2)), idItem]
    );
    const [rows] = await connection.execute(
      `SELECT op.id_os_peca, op.id_os, op.id_peca, p.nome AS peca_nome,
              p.codigo AS peca_codigo, op.descricao_snapshot, op.quantidade, op.valor_unitario
       FROM os_pecas AS op JOIN pecas AS p ON p.id_peca = op.id_peca
       WHERE op.id_os_peca = ?`,
      [idItem]
    );
    await connection.commit();
    return response.json({ item: rows[0] });
  } catch (error) {
    if (connection) await connection.rollback();
    return next(error);
  } finally {
    connection?.release();
  }
});

router.delete('/:id_os/os-pecas/:id_os_peca', async (request, response, next) => {
  let connection;
  try {
    const idOs = Number(request.params.id_os);
    const idItem = Number(request.params.id_os_peca);
    if (!Number.isInteger(idOs) || idOs <= 0 || !Number.isInteger(idItem) || idItem <= 0) {
      return response.status(400).json({ error: 'Informe uma ordem e uma peça válidas.' });
    }
    connection = await getPool().getConnection();
    await connection.beginTransaction();
    const [orderRows] = await connection.execute(
      `SELECT status_os.codigo AS status_codigo FROM ordens_servico AS os
       JOIN status_os ON status_os.id_status_os = os.id_status_os
       WHERE os.id_os = ? LIMIT 1 FOR UPDATE`,
      [idOs]
    );
    if (orderRows.length === 0) {
      await connection.rollback();
      return response.status(404).json({ error: 'Ordem de serviço não encontrada.' });
    }
    if (['CONCLUIDA', 'CANCELADA'].includes(orderRows[0].status_codigo)) {
      await connection.rollback();
      return response.status(409).json({ error: 'Não é possível alterar itens de uma ordem encerrada.' });
    }
    const [itemRows] = await connection.execute(
      `SELECT id_peca, quantidade FROM os_pecas
       WHERE id_os_peca = ? AND id_os = ? AND removida_em IS NULL
       LIMIT 1 FOR UPDATE`,
      [idItem, idOs]
    );
    if (itemRows.length === 0) {
      await connection.rollback();
      return response.status(404).json({ error: 'Peça da ordem não encontrada.' });
    }
    await connection.execute(
      'UPDATE os_pecas SET removida_em = NOW() WHERE id_os_peca = ?',
      [idItem]
    );
    await connection.execute(
      `INSERT INTO movimentos_estoque (
        id_peca, id_os_peca, registrado_por, quantidade_delta, motivo, observacao
      ) VALUES (?, ?, ?, ?, 'ESTORNO', ?)`,
      [itemRows[0].id_peca, idItem, request.user.id_usuario, Number(itemRows[0].quantidade), `Estorno por remoção da peça na OS ${idOs}`]
    );
    await connection.commit();
    return response.status(204).end();
  } catch (error) {
    if (connection) await connection.rollback();
    return next(error);
  } finally {
    connection?.release();
  }
});

module.exports = router;
