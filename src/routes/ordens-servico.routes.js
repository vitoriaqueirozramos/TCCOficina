const express = require('express');
const { getPool } = require('../config/database');
const { authenticate } = require('../middleware/auth.middleware');

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

router.use(authenticate, requireOrderAccess);

router.get('/', async (_request, response, next) => {
  try {
    const [rows] = await getPool().execute(
      `SELECT os.id_os,
              os.id_cliente,
              c.nome AS cliente_nome,
              os.id_veiculo,
              v.placa AS veiculo_placa,
              os.id_mecanico,
              u_mec.nome AS mecanico_nome,
              os.id_status_os,
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
       ORDER BY os.aberta_em DESC`
    );

    response.json({ ordens: rows });
  } catch (error) {
    next(error);
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
              os.id_mecanico,
              u_mec.nome AS mecanico_nome,
              os.id_status_os,
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

    return response.json({ ordem: rows[0] });
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

  try {
    const [statusRows] = await getPool().execute(
      'SELECT id_status_os FROM status_os WHERE codigo = ? LIMIT 1',
      ['ABERTA']
    );
    if (statusRows.length === 0) {
      return response.status(500).json({ error: 'Status inicial da OS não foi encontrado.' });
    }
    const resolvedStatusId = statusRows[0].id_status_os;
    if (idStatus !== null && idStatus !== resolvedStatusId) {
      return response.status(400).json({ error: 'Uma nova ordem deve iniciar no status Aberta.' });
    }

    const [result] = await getPool().execute(
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

    const [rows] = await getPool().execute(
      `SELECT os.id_os,
              os.id_cliente,
              c.nome AS cliente_nome,
              os.id_veiculo,
              v.placa AS veiculo_placa,
              os.id_mecanico,
              u_mec.nome AS mecanico_nome,
              os.id_status_os,
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

    return response.status(201).json({ ordem: rows[0] });
  } catch (error) {
    if (error.code === 'ER_NO_REFERENCED_ROW_2') {
      return response.status(400).json({ error: 'Cliente, veículo, mecânico ou status informado não existe.' });
    }

    return next(error);
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

    const [rows] = await getPool().execute(
      `SELECT hs.id_historico_status,
              hs.id_os,
              hs.id_status_anterior,
              sa.nome AS status_anterior_nome,
              hs.id_status_novo,
              sn.nome AS status_novo_nome,
              hs.alterado_por,
              ua.nome AS alterado_por_nome,
              hs.alterado_em,
              hs.observacao
       FROM historico_status_os AS hs
       LEFT JOIN status_os AS sa ON sa.id_status_os = hs.id_status_anterior
       JOIN status_os AS sn ON sn.id_status_os = hs.id_status_novo
       JOIN usuarios AS ua ON ua.id_usuario = hs.alterado_por
       WHERE hs.id_os = ?
       ORDER BY hs.alterado_em DESC`,
      [idOs]
    );

    return response.json({ historico: rows });
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
              os.id_mecanico,
              u_mec.nome AS mecanico_nome,
              os.id_status_os,
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

    const [historicoRows] = await connection.execute(
      `SELECT hs.id_historico_status,
              hs.id_os,
              hs.id_status_anterior,
              sa.nome AS status_anterior_nome,
              hs.id_status_novo,
              sn.nome AS status_novo_nome,
              hs.alterado_por,
              ua.nome AS alterado_por_nome,
              hs.alterado_em,
              hs.observacao
       FROM historico_status_os AS hs
       LEFT JOIN status_os AS sa ON sa.id_status_os = hs.id_status_anterior
       JOIN status_os AS sn ON sn.id_status_os = hs.id_status_novo
       JOIN usuarios AS ua ON ua.id_usuario = hs.alterado_por
       WHERE hs.id_os = ?
       ORDER BY hs.alterado_em DESC`,
      [idOs]
    );

    await connection.commit();
    return response.json({ ordem: rows[0], historico: historicoRows, ultimo_historico_id: historyResult.insertId });
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

    const [serviceRows] = await connection.execute('SELECT id_servico FROM servicos WHERE id_servico = ? LIMIT 1', [idServico]);
    if (serviceRows.length === 0) {
      await connection.rollback();
      return response.status(404).json({ error: 'Serviço não encontrado.' });
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

    const [partRows] = await connection.execute(
      'SELECT id_peca FROM pecas WHERE id_peca = ? LIMIT 1 FOR UPDATE',
      [idPeca]
    );
    if (partRows.length === 0) {
      await connection.rollback();
      return response.status(404).json({ error: 'Peça não encontrada.' });
    }

    const [balanceRows] = await connection.execute(
      `SELECT COALESCE(SUM(quantidade_delta), 0) AS saldo_atual
       FROM movimentos_estoque
       WHERE id_peca = ?`,
      [idPeca]
    );
    const saldoAtual = Number(balanceRows[0].saldo_atual);
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
      const [partRows] = await connection.execute('SELECT id_peca FROM pecas WHERE id_peca = ? LIMIT 1 FOR UPDATE', [idPeca]);
      if (partRows.length === 0) {
        await connection.rollback();
        return response.status(404).json({ error: 'Peça não encontrada.' });
      }
      if (variacao > 0) {
        const [balanceRows] = await connection.execute(
          'SELECT COALESCE(SUM(quantidade_delta), 0) AS saldo_atual FROM movimentos_estoque WHERE id_peca = ?',
          [idPeca]
        );
        const saldoAtual = Number(balanceRows[0].saldo_atual);
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
