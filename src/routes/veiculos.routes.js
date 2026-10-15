const express = require('express');
const { getPool } = require('../config/database');
const { authenticate } = require('../middleware/auth.middleware');
const { paginationMetadata, parseActiveFilter, parsePagination } = require('../utils/list-query');

const router = express.Router();

function requireVeiculoAccess(request, response, next) {
  const allowedProfiles = ['ADMINISTRADOR', 'ATENDENTE'];
  if (!request.user) {
    return response.status(401).json({ error: 'Autenticação necessária.' });
  }

  if (!allowedProfiles.includes(request.user.perfil)) {
    return response.status(403).json({ error: 'Acesso não autorizado.' });
  }

  return next();
}

router.use(authenticate, requireVeiculoAccess);

router.get('/', async (request, response, next) => {
  try {
    const search = typeof request.query.q === 'string' ? request.query.q.trim() : '';
    const active = parseActiveFilter(request.query.ativo);
    const pagination = parsePagination(request.query);
    const clientId = request.query.id_cliente === undefined ? null : Number(request.query.id_cliente);
    if (!pagination || Number.isNaN(active) || (clientId !== null && (!Number.isInteger(clientId) || clientId <= 0))) {
      return response.status(400).json({ error: 'Informe filtros de paginação, cliente ou situação válidos.' });
    }
    const filters = [];
    const params = [];
    if (search) {
      filters.push('(v.placa LIKE ? OR v.chassi LIKE ? OR v.marca LIKE ? OR v.modelo LIKE ? OR c.nome LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (active !== null) {
      filters.push('v.ativo = ?');
      params.push(active);
    }
    if (clientId !== null) {
      filters.push('v.id_cliente = ?');
      params.push(clientId);
    }
    const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const [countRows] = await getPool().execute(
      `SELECT COUNT(*) AS total FROM veiculos AS v JOIN clientes AS c ON c.id_cliente = v.id_cliente ${whereClause}`,
      params
    );
    const [rows] = await getPool().execute(
      `SELECT v.id_veiculo, v.id_cliente, c.nome AS cliente_nome, v.placa, v.chassi, v.marca, v.modelo, v.ano, v.cor, v.ativo, v.criado_em
       FROM veiculos AS v
       JOIN clientes AS c ON c.id_cliente = v.id_cliente
       ${whereClause}
       ORDER BY c.nome ASC, v.placa ASC`
      + ' LIMIT ? OFFSET ?',
      [...params, pagination.limit, pagination.offset]
    );

    response.json({ veiculos: rows, pagination: paginationMetadata(pagination.page, pagination.limit, Number(countRows[0].total)) });
  } catch (error) {
    next(error);
  }
});

router.get('/:id_veiculo', async (request, response, next) => {
  try {
    const idVeiculo = Number(request.params.id_veiculo);
    if (!Number.isInteger(idVeiculo) || idVeiculo <= 0) {
      return response.status(400).json({ error: 'Informe um veículo válido.' });
    }

    const [rows] = await getPool().execute(
      `SELECT v.id_veiculo, v.id_cliente, c.nome AS cliente_nome, v.placa, v.chassi, v.marca, v.modelo, v.ano, v.cor, v.ativo, v.criado_em
       FROM veiculos AS v
       JOIN clientes AS c ON c.id_cliente = v.id_cliente
       WHERE v.id_veiculo = ?
       LIMIT 1`,
      [idVeiculo]
    );
    if (rows.length === 0) {
      return response.status(404).json({ error: 'Veículo não encontrado.' });
    }
    return response.json({ veiculo: rows[0] });
  } catch (error) {
    return next(error);
  }
});

router.put('/:id_veiculo', async (request, response, next) => {
  const idVeiculo = Number(request.params.id_veiculo);
  const idCliente = Number(request.body?.id_cliente);
  const placa = typeof request.body?.placa === 'string' ? request.body.placa.trim().toUpperCase() : '';
  const chassi = typeof request.body?.chassi === 'string' ? request.body.chassi.trim() : '';
  const marca = typeof request.body?.marca === 'string' ? request.body.marca.trim() : '';
  const modelo = typeof request.body?.modelo === 'string' ? request.body.modelo.trim() : '';
  const ano = request.body?.ano === null || request.body?.ano === '' ? null : Number(request.body?.ano);
  const cor = typeof request.body?.cor === 'string' ? request.body.cor.trim() : '';

  if (!Number.isInteger(idVeiculo) || idVeiculo <= 0 || !Number.isInteger(idCliente) || idCliente <= 0) {
    return response.status(400).json({ error: 'Informe um veículo e um cliente válidos.' });
  }
  if (!placa || !marca || !modelo || (ano !== null && (!Number.isInteger(ano) || ano < 1886))) {
    return response.status(400).json({ error: 'Informe placa, marca, modelo e ano válidos.' });
  }

  try {
    const [result] = await getPool().execute(
      `UPDATE veiculos
       SET id_cliente = ?, placa = ?, chassi = ?, marca = ?, modelo = ?, ano = ?, cor = ?
       WHERE id_veiculo = ?`,
      [idCliente, placa, chassi || null, marca, modelo, ano, cor || null, idVeiculo]
    );
    if (result.affectedRows === 0) {
      const [existingRows] = await getPool().execute('SELECT id_veiculo FROM veiculos WHERE id_veiculo = ?', [idVeiculo]);
      if (existingRows.length === 0) {
        return response.status(404).json({ error: 'Veículo não encontrado.' });
      }
    }
    const [rows] = await getPool().execute(
      `SELECT v.id_veiculo, v.id_cliente, c.nome AS cliente_nome, v.placa, v.chassi, v.marca, v.modelo, v.ano, v.cor, v.ativo, v.criado_em
       FROM veiculos AS v JOIN clientes AS c ON c.id_cliente = v.id_cliente
       WHERE v.id_veiculo = ? LIMIT 1`,
      [idVeiculo]
    );
    return response.json({ veiculo: rows[0] });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return response.status(409).json({ error: 'Já existe um veículo com a mesma placa ou chassi.' });
    }
    if (error.code === 'ER_NO_REFERENCED_ROW_2') {
      return response.status(400).json({ error: 'Cliente informado não existe.' });
    }
    return next(error);
  }
});

router.patch('/:id_veiculo/ativo', async (request, response, next) => {
  const idVeiculo = Number(request.params.id_veiculo);
  const ativo = request.body?.ativo;
  if (!Number.isInteger(idVeiculo) || idVeiculo <= 0 || typeof ativo !== 'boolean') {
    return response.status(400).json({ error: 'Informe um veículo e uma situação válida.' });
  }

  try {
    const [result] = await getPool().execute('UPDATE veiculos SET ativo = ? WHERE id_veiculo = ?', [ativo, idVeiculo]);
    if (result.affectedRows === 0) {
      const [existingRows] = await getPool().execute('SELECT id_veiculo FROM veiculos WHERE id_veiculo = ?', [idVeiculo]);
      if (existingRows.length === 0) {
        return response.status(404).json({ error: 'Veículo não encontrado.' });
      }
    }
    return response.json({ message: ativo ? 'Veículo reativado.' : 'Veículo arquivado.' });
  } catch (error) {
    return next(error);
  }
});

router.post('/', async (request, response, next) => {
  const idCliente = Number(request.body?.id_cliente);
  const placa = typeof request.body?.placa === 'string' ? request.body.placa.trim().toUpperCase() : '';
  const chassi = typeof request.body?.chassi === 'string' ? request.body.chassi.trim() : '';
  const marca = typeof request.body?.marca === 'string' ? request.body.marca.trim() : '';
  const modelo = typeof request.body?.modelo === 'string' ? request.body.modelo.trim() : '';
  const ano = Number(request.body?.ano);
  const cor = typeof request.body?.cor === 'string' ? request.body.cor.trim() : '';

  if (!Number.isInteger(idCliente) || idCliente <= 0) {
    return response.status(400).json({ error: 'Informe um cliente válido.' });
  }

  if (!placa || !marca || !modelo) {
    return response.status(400).json({ error: 'Informe placa, marca e modelo do veículo.' });
  }

  try {
    const [result] = await getPool().execute(
      `INSERT INTO veiculos (id_cliente, placa, chassi, marca, modelo, ano, cor, ativo)
       VALUES (?, ?, ?, ?, ?, ?, ?, TRUE)`,
      [idCliente, placa, chassi || null, marca, modelo, Number.isInteger(ano) ? ano : null, cor || null]
    );

    const [rows] = await getPool().execute(
      `SELECT v.id_veiculo, v.id_cliente, c.nome AS cliente_nome, v.placa, v.chassi, v.marca, v.modelo, v.ano, v.cor, v.ativo, v.criado_em
       FROM veiculos AS v
       JOIN clientes AS c ON c.id_cliente = v.id_cliente
       WHERE v.id_veiculo = ?
       LIMIT 1`,
      [result.insertId]
    );

    return response.status(201).json({ veiculo: rows[0] });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return response.status(409).json({ error: 'Já existe um veículo com a mesma placa ou chassi.' });
    }

    if (error.code === 'ER_NO_REFERENCED_ROW_2') {
      return response.status(400).json({ error: 'Cliente informado não existe.' });
    }

    return next(error);
  }
});

router.get('/:id_veiculo/historico', async (request, response, next) => {
  try {
    const idVeiculo = Number(request.params.id_veiculo);
    if (!Number.isInteger(idVeiculo) || idVeiculo <= 0) {
      return response.status(400).json({ error: 'Informe um veículo válido.' });
    }

    const [veiculoRows] = await getPool().execute(
      `SELECT v.id_veiculo, v.id_cliente, c.nome AS cliente_nome, v.placa, v.chassi, v.marca, v.modelo, v.ano, v.cor, v.ativo, v.criado_em
       FROM veiculos AS v
       JOIN clientes AS c ON c.id_cliente = v.id_cliente
       WHERE v.id_veiculo = ?
       LIMIT 1`,
      [idVeiculo]
    );

    if (veiculoRows.length === 0) {
      return response.status(404).json({ error: 'Veículo não encontrado.' });
    }

    const [ordensRows] = await getPool().execute(
      `SELECT os.id_os,
              os.id_cliente,
              c.nome AS cliente_nome,
              os.id_veiculo,
              os.id_mecanico,
              um.nome AS mecanico_nome,
              os.id_status_os,
              so.codigo AS status_codigo,
              so.nome AS status_nome,
              os.aberta_por,
              uab.nome AS aberta_por_nome,
              os.aberta_em,
              os.previsao_conclusao,
              os.concluida_em,
              os.quilometragem_entrada,
              os.diagnostico,
              os.observacoes
       FROM ordens_servico AS os
       JOIN clientes AS c ON c.id_cliente = os.id_cliente
       LEFT JOIN mecanicos AS m ON m.id_mecanico = os.id_mecanico
       LEFT JOIN usuarios AS um ON um.id_usuario = m.id_usuario
       JOIN status_os AS so ON so.id_status_os = os.id_status_os
       JOIN usuarios AS uab ON uab.id_usuario = os.aberta_por
       WHERE os.id_veiculo = ?
       ORDER BY os.aberta_em DESC`,
      [idVeiculo]
    );

    const ordemIds = ordensRows.map((ordem) => ordem.id_os);
    const servicosPorOs = new Map();
    const pecasPorOs = new Map();

    if (ordemIds.length > 0) {
      const placeholders = ordemIds.map(() => '?').join(', ');

      const [servicosRows] = await getPool().execute(
        `SELECT osv.id_os_servico,
                osv.id_os,
                osv.id_servico,
                s.nome AS servico_nome,
                osv.descricao_snapshot,
                osv.quantidade,
                osv.valor_unitario
         FROM os_servicos AS osv
         JOIN servicos AS s ON s.id_servico = osv.id_servico
         WHERE osv.id_os IN (${placeholders}) AND osv.removida_em IS NULL
         ORDER BY osv.id_os_servico ASC`,
        ordemIds
      );

      const [pecasRows] = await getPool().execute(
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
         WHERE op.id_os IN (${placeholders}) AND op.removida_em IS NULL
         ORDER BY op.id_os_peca ASC`,
        ordemIds
      );

      for (const item of servicosRows) {
        if (!servicosPorOs.has(item.id_os)) {
          servicosPorOs.set(item.id_os, []);
        }
        servicosPorOs.get(item.id_os).push(item);
      }

      for (const item of pecasRows) {
        if (!pecasPorOs.has(item.id_os)) {
          pecasPorOs.set(item.id_os, []);
        }
        pecasPorOs.get(item.id_os).push(item);
      }
    }

    const ordens = ordensRows.map((ordem) => ({
      ...ordem,
      servicos: servicosPorOs.get(ordem.id_os) || [],
      pecas: pecasPorOs.get(ordem.id_os) || []
    }));

    return response.json({ veiculo: veiculoRows[0], ordens });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
