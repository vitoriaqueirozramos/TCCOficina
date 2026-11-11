const express = require('express');
const { getPool } = require('../config/database');
const { authenticate, requireRoles } = require('../middleware/auth.middleware');
const { paginationMetadata, parseActiveFilter, parseBoolean, parsePagination } = require('../utils/list-query');

const router = express.Router();
const MECHANIC_SELECT = `SELECT m.id_mecanico, m.id_usuario, u.nome AS nome_usuario, u.email, p.nome AS perfil_usuario,
                                m.especialidade, m.ativo,
                                (SELECT COUNT(*) FROM ordens_servico AS os
                                 JOIN status_os AS st ON st.id_status_os = os.id_status_os
                                 WHERE os.id_mecanico = m.id_mecanico
                                   AND st.codigo NOT IN ('CONCLUIDA', 'CANCELADA')) AS ordens_em_andamento
                         FROM mecanicos AS m
                         JOIN usuarios AS u ON u.id_usuario = m.id_usuario
                         JOIN perfis AS p ON p.id_perfil = u.id_perfil`;

router.use(authenticate, requireRoles('ADMINISTRADOR', 'ATENDENTE'));

async function findMechanic(executor, idMecanico) {
  const [rows] = await executor.execute(`${MECHANIC_SELECT} WHERE m.id_mecanico = ? LIMIT 1`, [idMecanico]);
  return rows[0] || null;
}

// Altera a situação do cadastro profissional. A conta de acesso só acompanha a mudança quando o
// perfil do usuário é MECANICO: um administrador ou atendente que também esteja cadastrado como
// mecânico continua entrando no sistema normalmente.
async function applyMechanicUpdate(idMecanico, { especialidade, ativo }) {
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      `SELECT m.id_usuario, m.ativo, p.nome AS perfil
       FROM mecanicos AS m
       JOIN usuarios AS u ON u.id_usuario = m.id_usuario
       JOIN perfis AS p ON p.id_perfil = u.id_perfil
       WHERE m.id_mecanico = ? LIMIT 1 FOR UPDATE`,
      [idMecanico]
    );
    if (rows.length === 0) {
      await connection.rollback();
      return null;
    }

    if (especialidade !== undefined) {
      await connection.execute('UPDATE mecanicos SET especialidade = ? WHERE id_mecanico = ?', [especialidade, idMecanico]);
    }
    let contaAlterada = false;
    if (ativo !== undefined) {
      await connection.execute('UPDATE mecanicos SET ativo = ? WHERE id_mecanico = ?', [ativo, idMecanico]);
      if (rows[0].perfil === 'MECANICO') {
        await connection.execute('UPDATE usuarios SET ativo = ? WHERE id_usuario = ?', [ativo, rows[0].id_usuario]);
        contaAlterada = true;
      }
    }

    const mecanico = await findMechanic(connection, idMecanico);
    await connection.commit();
    return { mecanico, contaAlterada };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

function statusMessage(result, ativo) {
  if (ativo) {
    return 'Mecânico ativado.';
  }
  const pendentes = Number(result.mecanico.ordens_em_andamento);
  const conta = result.contaAlterada ? '' : ' A conta de acesso foi mantida, pois o usuário possui outro perfil.';
  const ordens = pendentes > 0
    ? ` Há ${pendentes} ${pendentes === 1 ? 'ordem em andamento atribuída' : 'ordens em andamento atribuídas'} a ele; reatribua-as a outro mecânico.`
    : '';
  return `Mecânico inativado.${conta}${ordens}`;
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
      filters.push('(u.nome LIKE ? OR u.email LIKE ? OR m.especialidade LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (active !== null) {
      filters.push('m.ativo = ?');
      params.push(active);
    }
    const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const [countRows] = await getPool().execute(
      `SELECT COUNT(*) AS total FROM mecanicos AS m JOIN usuarios AS u ON u.id_usuario = m.id_usuario ${whereClause}`,
      params
    );
    const [rows] = await getPool().execute(
      `${MECHANIC_SELECT}
       ${whereClause}
       ORDER BY u.nome ASC
       LIMIT ? OFFSET ?`,
      [...params, pagination.limit, pagination.offset]
    );

    return response.json({ mecanicos: rows, pagination: paginationMetadata(pagination.page, pagination.limit, Number(countRows[0].total)) });
  } catch (error) {
    return next(error);
  }
});

// Todos os mecânicos ativos, para os seletores de responsável (sem a paginação da tela de cadastro).
router.get('/opcoes', async (_request, response, next) => {
  try {
    const [rows] = await getPool().execute(
      `${MECHANIC_SELECT}
       WHERE m.ativo = TRUE AND u.ativo = TRUE
       ORDER BY u.nome ASC`
    );
    response.json({
      mecanicos: rows.map((row) => ({
        id_mecanico: row.id_mecanico,
        nome: row.nome_usuario,
        especialidade: row.especialidade,
        ordens_em_andamento: Number(row.ordens_em_andamento)
      }))
    });
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
    const mecanico = await findMechanic(getPool(), idMecanico);
    if (!mecanico) {
      return response.status(404).json({ error: 'Mecânico não encontrado.' });
    }
    return response.json({ mecanico });
  } catch (error) {
    return next(error);
  }
});

router.put('/:id_mecanico', async (request, response, next) => {
  const idMecanico = Number(request.params.id_mecanico);
  const especialidade = typeof request.body?.especialidade === 'string' ? request.body.especialidade.trim() : '';
  const ativo = request.body?.ativo === undefined ? undefined : parseBoolean(request.body.ativo);
  if (!Number.isInteger(idMecanico) || idMecanico <= 0 || !especialidade || especialidade.length > 100 || ativo === null) {
    return response.status(400).json({ error: 'Informe especialidade (até 100 caracteres) e situação válidas.' });
  }

  try {
    const result = await applyMechanicUpdate(idMecanico, { especialidade, ativo });
    if (!result) {
      return response.status(404).json({ error: 'Mecânico não encontrado.' });
    }
    return response.json({ mecanico: result.mecanico });
  } catch (error) {
    return next(error);
  }
});

router.patch('/:id_mecanico/ativo', async (request, response, next) => {
  const idMecanico = Number(request.params.id_mecanico);
  const ativo = parseBoolean(request.body?.ativo);
  if (!Number.isInteger(idMecanico) || idMecanico <= 0 || ativo === null) {
    return response.status(400).json({ error: 'Informe um mecânico e uma situação válida (ativo: true ou false).' });
  }

  try {
    const result = await applyMechanicUpdate(idMecanico, { ativo });
    if (!result) {
      return response.status(404).json({ error: 'Mecânico não encontrado.' });
    }
    return response.json({ mecanico: result.mecanico, conta_alterada: result.contaAlterada, message: statusMessage(result, ativo) });
  } catch (error) {
    return next(error);
  }
});

router.post('/', async (request, response, next) => {
  const idUsuario = Number(request.body?.id_usuario);
  const especialidade = typeof request.body?.especialidade === 'string' ? request.body.especialidade.trim() : '';
  const ativo = request.body?.ativo === undefined ? true : parseBoolean(request.body.ativo);

  if (!Number.isInteger(idUsuario) || idUsuario <= 0) {
    return response.status(400).json({ error: 'Informe um usuário válido.' });
  }
  if (!especialidade || especialidade.length > 100) {
    return response.status(400).json({ error: 'Informe a especialidade do mecânico (até 100 caracteres).' });
  }
  if (ativo === null) {
    return response.status(400).json({ error: 'Informe uma situação válida (ativo: true ou false).' });
  }

  try {
    const [result] = await getPool().execute(
      'INSERT INTO mecanicos (id_usuario, especialidade, ativo) VALUES (?, ?, ?)',
      [idUsuario, especialidade, ativo]
    );
    return response.status(201).json({ mecanico: await findMechanic(getPool(), result.insertId) });
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
