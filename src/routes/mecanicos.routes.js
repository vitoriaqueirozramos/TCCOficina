const express = require('express');
const { getPool } = require('../config/database');
const { authenticate } = require('../middleware/auth.middleware');
const { paginationMetadata, parseActiveFilter, parsePagination } = require('../utils/list-query');

const router = express.Router();

function requireMecanicoAccess(request, response, next) {
  const allowedProfiles = ['ADMINISTRADOR', 'ATENDENTE'];
  if (!request.user) {
    return response.status(401).json({ error: 'Autenticação necessária.' });
  }

  if (!allowedProfiles.includes(request.user.perfil)) {
    return response.status(403).json({ error: 'Acesso não autorizado.' });
  }

  return next();
}

router.use(authenticate, requireMecanicoAccess);

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
      filters.push('(u.nome LIKE ? OR u.email LIKE ? OR m.especialidade LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (active !== null) {
      filters.push('m.ativo = ?');
      params.push(active);
    }
    const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const joinClause = 'FROM mecanicos AS m JOIN usuarios AS u ON u.id_usuario = m.id_usuario';
    const [countRows] = await getPool().execute(`SELECT COUNT(*) AS total ${joinClause} ${whereClause}`, params);
    const [rows] = await getPool().execute(
      `SELECT m.id_mecanico, m.id_usuario, u.nome AS nome_usuario, u.email, m.especialidade, m.ativo
       ${joinClause}
       ${whereClause}
       ORDER BY u.nome ASC
       LIMIT ? OFFSET ?`,
      [...params, pagination.limit, pagination.offset]
    );

    response.json({ mecanicos: rows, pagination: paginationMetadata(pagination.page, pagination.limit, Number(countRows[0].total)) });
  } catch (error) {
    next(error);
  }
});

router.get('/:id_mecanico', async (request, response, next) => {
  try {
    const idMecanico = Number(request.params.id_mecanico);
    if (!Number.isInteger(idMecanico) || idMecanico <= 0) {
      return response.status(400).json({ error: 'Informe um mecânico válido.' });
    }
    const [rows] = await getPool().execute(
      `SELECT m.id_mecanico, m.id_usuario, u.nome AS nome_usuario, u.email, m.especialidade, m.ativo
       FROM mecanicos AS m JOIN usuarios AS u ON u.id_usuario = m.id_usuario
       WHERE m.id_mecanico = ? LIMIT 1`,
      [idMecanico]
    );
    if (rows.length === 0) {
      return response.status(404).json({ error: 'Mecânico não encontrado.' });
    }
    return response.json({ mecanico: rows[0] });
  } catch (error) {
    return next(error);
  }
});

router.put('/:id_mecanico', async (request, response, next) => {
  const idMecanico = Number(request.params.id_mecanico);
  const especialidade = typeof request.body?.especialidade === 'string' ? request.body.especialidade.trim() : '';
  const ativo = request.body?.ativo;
  if (!Number.isInteger(idMecanico) || idMecanico <= 0 || !especialidade || typeof ativo !== 'boolean') {
    return response.status(400).json({ error: 'Informe especialidade e situação válidas.' });
  }

  let connection;
  try {
    connection = await getPool().getConnection();
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      'SELECT id_usuario FROM mecanicos WHERE id_mecanico = ? LIMIT 1 FOR UPDATE',
      [idMecanico]
    );
    if (rows.length === 0) {
      await connection.rollback();
      return response.status(404).json({ error: 'Mecânico não encontrado.' });
    }
    await connection.execute('UPDATE mecanicos SET especialidade = ?, ativo = ? WHERE id_mecanico = ?', [especialidade, ativo, idMecanico]);
    await connection.execute('UPDATE usuarios SET ativo = ? WHERE id_usuario = ?', [ativo, rows[0].id_usuario]);
    const [updatedRows] = await connection.execute(
      `SELECT m.id_mecanico, m.id_usuario, u.nome AS nome_usuario, u.email, m.especialidade, m.ativo
       FROM mecanicos AS m JOIN usuarios AS u ON u.id_usuario = m.id_usuario
       WHERE m.id_mecanico = ? LIMIT 1`,
      [idMecanico]
    );
    await connection.commit();
    return response.json({ mecanico: updatedRows[0] });
  } catch (error) {
    if (connection) await connection.rollback();
    return next(error);
  } finally {
    connection?.release();
  }
});

router.post('/', async (request, response, next) => {
  const idUsuario = Number(request.body?.id_usuario);
  const especialidade = typeof request.body?.especialidade === 'string' ? request.body.especialidade.trim() : '';
  const ativo = request.body?.ativo !== undefined ? Boolean(request.body.ativo) : true;

  if (!Number.isInteger(idUsuario) || idUsuario <= 0) {
    return response.status(400).json({ error: 'Informe um usuário válido.' });
  }

  if (!especialidade) {
    return response.status(400).json({ error: 'Informe a especialidade do mecânico.' });
  }

  try {
    const [result] = await getPool().execute(
      `INSERT INTO mecanicos (id_usuario, especialidade, ativo)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE especialidade = VALUES(especialidade), ativo = VALUES(ativo)`,
      [idUsuario, especialidade, ativo]
    );

    const [rows] = await getPool().execute(
      `SELECT m.id_mecanico, m.id_usuario, u.nome AS nome_usuario, u.email, m.especialidade, m.ativo
       FROM mecanicos AS m
       JOIN usuarios AS u ON u.id_usuario = m.id_usuario
       WHERE m.id_usuario = ?
       LIMIT 1`,
      [idUsuario]
    );

    if (!rows[0]) {
      return response.status(500).json({ error: 'Mecânico não foi registrado.' });
    }

    return response.status(201).json({ mecanico: rows[0] });
  } catch (error) {
    if (error.code === 'ER_NO_REFERENCED_ROW_2') {
      return response.status(400).json({ error: 'Usuário informado não existe.' });
    }

    if (error.code === 'ER_DUP_ENTRY') {
      return response.status(409).json({ error: 'Este usuário já está vinculado a um mecânico.' });
    }

    return next(error);
  }
});

module.exports = router;
