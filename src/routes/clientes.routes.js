const express = require('express');
const { getPool } = require('../config/database');
const { authenticate } = require('../middleware/auth.middleware');
const { paginationMetadata, parseActiveFilter, parsePagination } = require('../utils/list-query');

const router = express.Router();

function requireClienteAccess(request, response, next) {
  const allowedProfiles = ['ADMINISTRADOR', 'ATENDENTE'];
  if (!request.user) {
    return response.status(401).json({ error: 'Autenticação necessária.' });
  }

  if (!allowedProfiles.includes(request.user.perfil)) {
    return response.status(403).json({ error: 'Acesso não autorizado.' });
  }

  return next();
}

router.use(authenticate, requireClienteAccess);

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
      filters.push('(nome LIKE ? OR documento LIKE ? OR telefone LIKE ? OR email LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (active !== null) {
      filters.push('ativo = ?');
      params.push(active);
    }
    const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const [countRows] = await getPool().execute(`SELECT COUNT(*) AS total FROM clientes ${whereClause}`, params);
    const [rows] = await getPool().execute(
      `SELECT id_cliente, nome, documento, telefone, email, endereco, ativo, criado_em
       FROM clientes
       ${whereClause}
       ORDER BY nome ASC
       LIMIT ? OFFSET ?`,
      [...params, pagination.limit, pagination.offset]
    );

    response.json({ clientes: rows, pagination: paginationMetadata(pagination.page, pagination.limit, Number(countRows[0].total)) });
  } catch (error) {
    next(error);
  }
});

router.get('/:id_cliente', async (request, response, next) => {
  try {
    const idCliente = Number(request.params.id_cliente);
    if (!Number.isInteger(idCliente) || idCliente <= 0) {
      return response.status(400).json({ error: 'Informe um cliente válido.' });
    }

    const [rows] = await getPool().execute(
      `SELECT id_cliente, nome, documento, telefone, email, endereco, ativo, criado_em
       FROM clientes
       WHERE id_cliente = ?
       LIMIT 1`,
      [idCliente]
    );

    if (rows.length === 0) {
      return response.status(404).json({ error: 'Cliente não encontrado.' });
    }

    return response.json({ cliente: rows[0] });
  } catch (error) {
    return next(error);
  }
});

router.put('/:id_cliente', async (request, response, next) => {
  const idCliente = Number(request.params.id_cliente);
  const nome = typeof request.body?.nome === 'string' ? request.body.nome.trim() : '';
  const documento = typeof request.body?.documento === 'string' ? request.body.documento.trim() : '';
  const telefone = typeof request.body?.telefone === 'string' ? request.body.telefone.trim() : '';
  const email = typeof request.body?.email === 'string' ? request.body.email.trim().toLowerCase() : '';
  const endereco = typeof request.body?.endereco === 'string' ? request.body.endereco.trim() : '';

  if (!Number.isInteger(idCliente) || idCliente <= 0 || !nome) {
    return response.status(400).json({ error: 'Informe um cliente e um nome válidos.' });
  }

  try {
    const [result] = await getPool().execute(
      `UPDATE clientes
       SET nome = ?, documento = ?, telefone = ?, email = ?, endereco = ?
       WHERE id_cliente = ?`,
      [nome, documento || null, telefone || null, email || null, endereco || null, idCliente]
    );

    if (result.affectedRows === 0) {
      const [existingRows] = await getPool().execute('SELECT id_cliente FROM clientes WHERE id_cliente = ?', [idCliente]);
      if (existingRows.length === 0) {
        return response.status(404).json({ error: 'Cliente não encontrado.' });
      }
    }

    const [rows] = await getPool().execute(
      `SELECT id_cliente, nome, documento, telefone, email, endereco, ativo, criado_em
       FROM clientes WHERE id_cliente = ? LIMIT 1`,
      [idCliente]
    );
    return response.json({ cliente: rows[0] });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return response.status(409).json({ error: 'Já existe um cliente com este documento.' });
    }
    return next(error);
  }
});

router.patch('/:id_cliente/ativo', async (request, response, next) => {
  const idCliente = Number(request.params.id_cliente);
  const ativo = request.body?.ativo;
  if (!Number.isInteger(idCliente) || idCliente <= 0 || typeof ativo !== 'boolean') {
    return response.status(400).json({ error: 'Informe um cliente e uma situação válida.' });
  }

  try {
    const [result] = await getPool().execute(
      'UPDATE clientes SET ativo = ? WHERE id_cliente = ?',
      [ativo, idCliente]
    );
    if (result.affectedRows === 0) {
      const [existingRows] = await getPool().execute('SELECT id_cliente FROM clientes WHERE id_cliente = ?', [idCliente]);
      if (existingRows.length === 0) {
        return response.status(404).json({ error: 'Cliente não encontrado.' });
      }
    }

    const [rows] = await getPool().execute(
      'SELECT id_cliente, nome, documento, telefone, email, endereco, ativo, criado_em FROM clientes WHERE id_cliente = ? LIMIT 1',
      [idCliente]
    );
    return response.json({ cliente: rows[0] });
  } catch (error) {
    return next(error);
  }
});

router.post('/', async (request, response, next) => {
  const nome = typeof request.body?.nome === 'string' ? request.body.nome.trim() : '';
  const documento = typeof request.body?.documento === 'string' ? request.body.documento.trim() : '';
  const telefone = typeof request.body?.telefone === 'string' ? request.body.telefone.trim() : '';
  const email = typeof request.body?.email === 'string' ? request.body.email.trim().toLowerCase() : '';
  const endereco = typeof request.body?.endereco === 'string' ? request.body.endereco.trim() : '';

  if (!nome) {
    return response.status(400).json({ error: 'Informe o nome do cliente.' });
  }

  const normalizedDocumento = documento || null;
  const normalizedTelefone = telefone || null;
  const normalizedEmail = email || null;
  const normalizedEndereco = endereco || null;

  try {
    const [result] = await getPool().execute(
      `INSERT INTO clientes (nome, documento, telefone, email, endereco, ativo)
       VALUES (?, ?, ?, ?, ?, TRUE)`,
      [nome, normalizedDocumento, normalizedTelefone, normalizedEmail, normalizedEndereco]
    );

    const [rows] = await getPool().execute(
      `SELECT id_cliente, nome, documento, telefone, email, endereco, ativo, criado_em
       FROM clientes
       WHERE id_cliente = ?
       LIMIT 1`,
      [result.insertId]
    );

    return response.status(201).json({ cliente: rows[0] });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return response.status(409).json({ error: 'Já existe um cliente com este documento.' });
    }

    return next(error);
  }
});

module.exports = router;
