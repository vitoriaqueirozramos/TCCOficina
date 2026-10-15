const express = require('express');
const { getPool } = require('../config/database');
const { authenticate } = require('../middleware/auth.middleware');
const { paginationMetadata, parseActiveFilter, parsePagination } = require('../utils/list-query');

const router = express.Router();

function requireServicoAccess(request, response, next) {
  const allowedProfiles = ['ADMINISTRADOR', 'ATENDENTE'];
  if (!request.user) {
    return response.status(401).json({ error: 'Autenticação necessária.' });
  }

  if (!allowedProfiles.includes(request.user.perfil)) {
    return response.status(403).json({ error: 'Acesso não autorizado.' });
  }

  return next();
}

router.use(authenticate, requireServicoAccess);

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
      `SELECT id_servico, nome, descricao, preco_atual, ativo
       FROM servicos
       ${whereClause}
       ORDER BY nome ASC
       LIMIT ? OFFSET ?`,
      [...params, pagination.limit, pagination.offset]
    );

    response.json({ servicos: rows, pagination: paginationMetadata(pagination.page, pagination.limit, Number(countRows[0].total)) });
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
    const [rows] = await getPool().execute(
      'SELECT id_servico, nome, descricao, preco_atual, ativo FROM servicos WHERE id_servico = ? LIMIT 1',
      [idServico]
    );
    if (rows.length === 0) {
      return response.status(404).json({ error: 'Serviço não encontrado.' });
    }
    return response.json({ servico: rows[0] });
  } catch (error) {
    return next(error);
  }
});

router.put('/:id_servico', async (request, response, next) => {
  const idServico = Number(request.params.id_servico);
  const nome = typeof request.body?.nome === 'string' ? request.body.nome.trim() : '';
  const descricao = typeof request.body?.descricao === 'string' ? request.body.descricao.trim() : '';
  const precoAtual = Number(request.body?.preco_atual);
  if (!Number.isInteger(idServico) || idServico <= 0 || !nome || !Number.isFinite(precoAtual) || precoAtual < 0) {
    return response.status(400).json({ error: 'Informe um serviço, nome e preço válidos.' });
  }
  try {
    const [result] = await getPool().execute(
      'UPDATE servicos SET nome = ?, descricao = ?, preco_atual = ? WHERE id_servico = ?',
      [nome, descricao || null, Number(precoAtual.toFixed(2)), idServico]
    );
    if (result.affectedRows === 0) {
      const [existingRows] = await getPool().execute('SELECT id_servico FROM servicos WHERE id_servico = ?', [idServico]);
      if (existingRows.length === 0) {
        return response.status(404).json({ error: 'Serviço não encontrado.' });
      }
    }
    const [rows] = await getPool().execute(
      'SELECT id_servico, nome, descricao, preco_atual, ativo FROM servicos WHERE id_servico = ? LIMIT 1',
      [idServico]
    );
    return response.json({ servico: rows[0] });
  } catch (error) {
    return next(error);
  }
});

router.patch('/:id_servico/ativo', async (request, response, next) => {
  const idServico = Number(request.params.id_servico);
  const ativo = request.body?.ativo;
  if (!Number.isInteger(idServico) || idServico <= 0 || typeof ativo !== 'boolean') {
    return response.status(400).json({ error: 'Informe um serviço e uma situação válida.' });
  }
  try {
    const [result] = await getPool().execute('UPDATE servicos SET ativo = ? WHERE id_servico = ?', [ativo, idServico]);
    if (result.affectedRows === 0) {
      const [existingRows] = await getPool().execute('SELECT id_servico FROM servicos WHERE id_servico = ?', [idServico]);
      if (existingRows.length === 0) {
        return response.status(404).json({ error: 'Serviço não encontrado.' });
      }
    }
    return response.json({ message: ativo ? 'Serviço reativado.' : 'Serviço arquivado.' });
  } catch (error) {
    return next(error);
  }
});

router.post('/', async (request, response, next) => {
  const nome = typeof request.body?.nome === 'string' ? request.body.nome.trim() : '';
  const descricao = typeof request.body?.descricao === 'string' ? request.body.descricao.trim() : null;
  const precoAt = Number(request.body?.preco_atual);
  const ativo = request.body?.ativo !== undefined ? Boolean(request.body.ativo) : true;

  if (!nome) {
    return response.status(400).json({ error: 'Informe o nome do serviço.' });
  }

  if (!Number.isFinite(precoAt) || precoAt < 0) {
    return response.status(400).json({ error: 'Informe um preço válido para o serviço.' });
  }

  try {
    const [result] = await getPool().execute(
      `INSERT INTO servicos (nome, descricao, preco_atual, ativo)
       VALUES (?, ?, ?, ?)` ,
      [nome, descricao || null, Number(precoAt.toFixed(2)), ativo]
    );

    const [rows] = await getPool().execute(
      `SELECT id_servico, nome, descricao, preco_atual, ativo
       FROM servicos
       WHERE id_servico = ?
       LIMIT 1`,
      [result.insertId]
    );

    return response.status(201).json({ servico: rows[0] });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
