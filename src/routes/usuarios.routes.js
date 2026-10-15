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
      `SELECT id_usuario, nome, email
       FROM usuarios
       ORDER BY nome ASC`
    );

    response.json({ usuarios: rows });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
