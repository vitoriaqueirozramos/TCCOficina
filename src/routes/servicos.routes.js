const express = require('express');
const { getPool } = require('../config/database');
const { authenticate, requireRoles } = require('../middleware/auth.middleware');
const { paginationMetadata, parseActiveFilter, parseBoolean, parsePagination } = require('../utils/list-query');

const router = express.Router();
const SERVICE_COLUMNS = 'id_servico, nome, descricao, preco_atual, duracao_minutos, ativo';

router.use(authenticate, requireRoles('ADMINISTRADOR', 'ATENDENTE'));

// Duração estimada em minutos: opcional; quando informada, inteiro entre 1 e 6000.
function parseDuration(value) {
  if (value === undefined || value === null || value === '') return null;
  const minutes = Number(value);
  return Number.isInteger(minutes) && minutes > 0 && minutes <= 6000 ? minutes : Number.NaN;
}

async function findService(idServico) {
  const [rows] = await getPool().execute(
    `SELECT ${SERVICE_COLUMNS} FROM servicos WHERE id_servico = ? LIMIT 1`,
    [idServico]
  );
  return rows[0] || null;
}

router.get('/', async (request, response, next) => {
  try {
    const search = typeof request.query.q === 'string' ? request.query.q.trim() : '';
    const active = parseActiveFilter(request.query.ativo);
    const pagination = parsePagination(request.query);
    if (!pagination || Number.isNaN(active)) {
      return response.status(400).json({ error: 'Informe filtros de paginação ou situação válidos.' });
    }
    const filters = [];
    const params = [];
    if (search) {
      filters.push('(nome LIKE ? OR descricao LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }
    if (active !== null) {
      filters.push('ativo = ?');
      params.push(active);
    }
    const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const [countRows] = await getPool().execute(`SELECT COUNT(*) AS total FROM servicos ${whereClause}`, params);
    const [rows] = await getPool().execute(
      `SELECT ${SERVICE_COLUMNS}
       FROM servicos
       ${whereClause}
       ORDER BY nome ASC
       LIMIT ${Number.parseInt(pagination.limit, 10)} OFFSET ${Number.parseInt(pagination.offset, 10)}`,
      params
    );

    return response.json({ servicos: rows, pagination: paginationMetadata(pagination.page, pagination.limit, Number(countRows[0].total)) });
  } catch (error) {
    return next(error);
  }
});

// Serviços ativos para os seletores (sem a paginação da tela de cadastro).
router.get('/opcoes', async (_request, response, next) => {
  try {
    const [rows] = await getPool().execute(
      'SELECT id_servico, nome, preco_atual, duracao_minutos FROM servicos WHERE ativo = TRUE ORDER BY nome ASC'
    );
    response.json({ servicos: rows });
  } catch (error) {
    next(error);
  }
});

router.get('/:id_servico', async (request, response, next) => {
  try {
    const idServico = Number(request.params.id_servico);
    if (!Number.isInteger(idServico) || idServico <= 0) {
      return response.status(400).json({ error: 'Informe um serviço válido.' });
    }
    const servico = await findService(idServico);
    if (!servico) {
      return response.status(404).json({ error: 'Serviço não encontrado.' });
    }
    return response.json({ servico });
  } catch (error) {
    return next(error);
  }
});

function readServiceBody(body) {
  const nome = typeof body?.nome === 'string' ? body.nome.trim() : '';
  const descricao = typeof body?.descricao === 'string' ? body.descricao.trim() : '';
  const precoAtual = Number(body?.preco_atual);
  const duracao = parseDuration(body?.duracao_minutos);

  if (!nome || nome.length > 120) {
    return { error: 'Informe o nome do serviço (até 120 caracteres).' };
  }
  if (body?.preco_atual === '' || body?.preco_atual === null || !Number.isFinite(precoAtual) || precoAtual < 0) {
    return { error: 'Informe um preço válido para o serviço.' };
  }
  if (Number.isNaN(duracao)) {
    return { error: 'Informe a duração estimada em minutos (número inteiro maior que zero).' };
  }
  return { values: { nome, descricao: descricao || null, precoAtual: Number(precoAtual.toFixed(2)), duracao } };
}

router.put('/:id_servico', async (request, response, next) => {
  const idServico = Number(request.params.id_servico);
  if (!Number.isInteger(idServico) || idServico <= 0) {
    return response.status(400).json({ error: 'Informe um serviço válido.' });
  }
  const { error, values } = readServiceBody(request.body);
  if (error) {
    return response.status(400).json({ error });
  }
  try {
    await getPool().execute(
      'UPDATE servicos SET nome = ?, descricao = ?, preco_atual = ?, duracao_minutos = ? WHERE id_servico = ?',
      [values.nome, values.descricao, values.precoAtual, values.duracao, idServico]
    );
    const servico = await findService(idServico);
    if (!servico) {
      return response.status(404).json({ error: 'Serviço não encontrado.' });
    }
    return response.json({ servico });
  } catch (caught) {
    return next(caught);
  }
});

router.patch('/:id_servico/ativo', async (request, response, next) => {
  const idServico = Number(request.params.id_servico);
  const ativo = parseBoolean(request.body?.ativo);
  if (!Number.isInteger(idServico) || idServico <= 0 || ativo === null) {
    return response.status(400).json({ error: 'Informe um serviço e uma situação válida (ativo: true ou false).' });
  }
  try {
    await getPool().execute('UPDATE servicos SET ativo = ? WHERE id_servico = ?', [ativo, idServico]);
    const servico = await findService(idServico);
    if (!servico) {
      return response.status(404).json({ error: 'Serviço não encontrado.' });
    }
    return response.json({ servico, message: ativo ? 'Serviço ativado.' : 'Serviço inativado.' });
  } catch (error) {
    return next(error);
  }
});

router.post('/', async (request, response, next) => {
  const ativo = request.body?.ativo === undefined ? true : parseBoolean(request.body.ativo);
  const { error, values } = readServiceBody(request.body);
  if (error) {
    return response.status(400).json({ error });
  }
  if (ativo === null) {
    return response.status(400).json({ error: 'Informe uma situação válida (ativo: true ou false).' });
  }

  try {
    const [result] = await getPool().execute(
      `INSERT INTO servicos (nome, descricao, preco_atual, duracao_minutos, ativo)
       VALUES (?, ?, ?, ?, ?)`,
      [values.nome, values.descricao, values.precoAtual, values.duracao, ativo]
    );
    return response.status(201).json({ servico: await findService(result.insertId) });
  } catch (caught) {
    return next(caught);
  }
});

module.exports = router;
