const express = require('express');
const { getPool } = require('../config/database');
const { authenticate } = require('../middleware/auth.middleware');
const { paginationMetadata, parseActiveFilter, parsePagination } = require('../utils/list-query');

const router = express.Router();

function requirePecaAccess(request, response, next) {
  const allowedProfiles = ['ADMINISTRADOR', 'ATENDENTE'];
  if (!request.user) {
    return response.status(401).json({ error: 'Autenticação necessária.' });
  }

  if (!allowedProfiles.includes(request.user.perfil)) {
    return response.status(403).json({ error: 'Acesso não autorizado.' });
  }

  return next();
}

router.use(authenticate, requirePecaAccess);

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
      filters.push('(codigo LIKE ? OR nome LIKE ? OR descricao LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (active !== null) {
      filters.push('ativo = ?');
      params.push(active);
    }
    const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const [countRows] = await getPool().execute(`SELECT COUNT(*) AS total FROM pecas ${whereClause}`, params);
    const [rows] = await getPool().execute(
      `SELECT id_peca, codigo, nome, descricao, preco_atual, estoque_minimo, ativo
       FROM pecas
       ${whereClause}
       ORDER BY nome ASC
       LIMIT ? OFFSET ?`,
      [...params, pagination.limit, pagination.offset]
    );

    response.json({ pecas: rows, pagination: paginationMetadata(pagination.page, pagination.limit, Number(countRows[0].total)) });
  } catch (error) {
    next(error);
  }
});

router.get('/:id_peca', async (request, response, next) => {
  try {
    const idPeca = Number(request.params.id_peca);
    if (!Number.isInteger(idPeca) || idPeca <= 0) {
      return response.status(400).json({ error: 'Informe uma peça válida.' });
    }
    const [rows] = await getPool().execute(
      'SELECT id_peca, codigo, nome, descricao, preco_atual, estoque_minimo, ativo FROM pecas WHERE id_peca = ? LIMIT 1',
      [idPeca]
    );
    if (rows.length === 0) {
      return response.status(404).json({ error: 'Peça não encontrada.' });
    }
    return response.json({ peca: rows[0] });
  } catch (error) {
    return next(error);
  }
});

router.put('/:id_peca', async (request, response, next) => {
  const idPeca = Number(request.params.id_peca);
  const codigo = typeof request.body?.codigo === 'string' ? request.body.codigo.trim() : '';
  const nome = typeof request.body?.nome === 'string' ? request.body.nome.trim() : '';
  const descricao = typeof request.body?.descricao === 'string' ? request.body.descricao.trim() : '';
  const precoAtual = Number(request.body?.preco_atual);
  const estoqueMinimo = Number(request.body?.estoque_minimo);
  if (!Number.isInteger(idPeca) || idPeca <= 0 || !codigo || !nome || !Number.isFinite(precoAtual) || precoAtual < 0 || !Number.isInteger(estoqueMinimo) || estoqueMinimo < 0) {
    return response.status(400).json({ error: 'Informe código, nome, preço e estoque mínimo válidos.' });
  }
  try {
    const [result] = await getPool().execute(
      `UPDATE pecas SET codigo = ?, nome = ?, descricao = ?, preco_atual = ?, estoque_minimo = ?
       WHERE id_peca = ?`,
      [codigo, nome, descricao || null, Number(precoAtual.toFixed(2)), estoqueMinimo, idPeca]
    );
    if (result.affectedRows === 0) {
      const [existingRows] = await getPool().execute('SELECT id_peca FROM pecas WHERE id_peca = ?', [idPeca]);
      if (existingRows.length === 0) {
        return response.status(404).json({ error: 'Peça não encontrada.' });
      }
    }
    const [rows] = await getPool().execute(
      'SELECT id_peca, codigo, nome, descricao, preco_atual, estoque_minimo, ativo FROM pecas WHERE id_peca = ? LIMIT 1',
      [idPeca]
    );
    return response.json({ peca: rows[0] });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return response.status(409).json({ error: 'Já existe uma peça com este código.' });
    }
    return next(error);
  }
});

router.patch('/:id_peca/ativo', async (request, response, next) => {
  const idPeca = Number(request.params.id_peca);
  const ativo = request.body?.ativo;
  if (!Number.isInteger(idPeca) || idPeca <= 0 || typeof ativo !== 'boolean') {
    return response.status(400).json({ error: 'Informe uma peça e uma situação válida.' });
  }
  try {
    const [result] = await getPool().execute('UPDATE pecas SET ativo = ? WHERE id_peca = ?', [ativo, idPeca]);
    if (result.affectedRows === 0) {
      const [existingRows] = await getPool().execute('SELECT id_peca FROM pecas WHERE id_peca = ?', [idPeca]);
      if (existingRows.length === 0) {
        return response.status(404).json({ error: 'Peça não encontrada.' });
      }
    }
    return response.json({ message: ativo ? 'Peça reativada.' : 'Peça arquivada.' });
  } catch (error) {
    return next(error);
  }
});

router.post('/', async (request, response, next) => {
  const codigo = typeof request.body?.codigo === 'string' ? request.body.codigo.trim() : '';
  const nome = typeof request.body?.nome === 'string' ? request.body.nome.trim() : '';
  const descricao = typeof request.body?.descricao === 'string' ? request.body.descricao.trim() : null;
  const precoAtual = Number(request.body?.preco_atual);
  const estoqueMinimo = Number(request.body?.estoque_minimo || 0);
  const ativo = request.body?.ativo !== undefined ? Boolean(request.body.ativo) : true;

  if (!codigo) {
    return response.status(400).json({ error: 'Informe o código da peça.' });
  }

  if (!nome) {
    return response.status(400).json({ error: 'Informe o nome da peça.' });
  }

  if (!Number.isFinite(precoAtual) || precoAtual < 0) {
    return response.status(400).json({ error: 'Informe um preço válido para a peça.' });
  }

  if (!Number.isInteger(estoqueMinimo) || estoqueMinimo < 0) {
    return response.status(400).json({ error: 'Informe um estoque mínimo válido.' });
  }

  try {
    const [result] = await getPool().execute(
      `INSERT INTO pecas (codigo, nome, descricao, preco_atual, estoque_minimo, ativo)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [codigo, nome, descricao || null, Number(precoAtual.toFixed(2)), estoqueMinimo, ativo]
    );

    const [rows] = await getPool().execute(
      `SELECT id_peca, codigo, nome, descricao, preco_atual, estoque_minimo, ativo
       FROM pecas
       WHERE id_peca = ?
       LIMIT 1`,
      [result.insertId]
    );

    return response.status(201).json({ peca: rows[0] });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return response.status(409).json({ error: 'Já existe uma peça com este código.' });
    }

    return next(error);
  }
});

module.exports = router;
