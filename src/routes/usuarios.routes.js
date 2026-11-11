const express = require('express');
const { getPool } = require('../config/database');
const { authenticate } = require('../middleware/auth.middleware');

const router = express.Router();

function requireFuncionarioAccess(request, response, next) {
  const allowedProfiles = ['ADMINISTRADOR', 'ATENDENTE'];
  if (!request.user) {
    return response.status(401).json({ error: 'Autenticação necessária.' });
  }

  if (!allowedProfiles.includes(request.user.perfil)) {
    return response.status(403).json({ error: 'Acesso não autorizado.' });
  }

  return next();
}

router.use(authenticate, requireFuncionarioAccess);

router.get('/', async (_request, response, next) => {
  try {
    const [rows] = await getPool().execute(
      `SELECT u.id_usuario, u.nome, u.email, u.ativo, p.nome AS perfil, m.id_mecanico
       FROM usuarios AS u
       JOIN perfis AS p ON p.id_perfil = u.id_perfil
       LEFT JOIN mecanicos AS m ON m.id_usuario = u.id_usuario
       ORDER BY u.nome ASC`
    );

    response.json({ usuarios: rows });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
