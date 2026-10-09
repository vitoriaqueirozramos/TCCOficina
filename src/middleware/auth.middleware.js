const jwt = require('jsonwebtoken');
const { getPool } = require('../config/database');
const { clearAuthCookie, cookieName, getJwtSecret } = require('../config/auth');

function unauthorized(response) {
  clearAuthCookie(response);
  response.status(401).json({ error: 'Autenticação necessária.' });
}

async function authenticate(request, response, next) {
  const token = request.cookies?.[cookieName];
  if (!token) {
    return unauthorized(response);
  }

  let claims;
  try {
    claims = jwt.verify(token, getJwtSecret(), { issuer: 'oficinatech' });
  } catch {
    return unauthorized(response);
  }

  try {
    const [users] = await getPool().execute(
      `SELECT u.id_usuario, u.nome, u.email, p.nome AS perfil
       FROM usuarios AS u
       JOIN perfis AS p ON p.id_perfil = u.id_perfil
       WHERE u.id_usuario = ? AND u.ativo = TRUE
       LIMIT 1`,
      [claims.sub]
    );

    if (users.length === 0) {
      return unauthorized(response);
    }

    const user = users[0];
    request.user = {
      id_usuario: user.id_usuario,
      nome: user.nome,
      email: user.email,
      perfil: user.perfil
    };
    return next();
  } catch (error) {
    return next(error);
  }
}

function requireRoles(...allowedRoles) {
  return (request, response, next) => {
    if (!request.user) {
      return unauthorized(response);
    }

    if (!allowedRoles.includes(request.user.perfil)) {
      return response.status(403).json({ error: 'Acesso não autorizado.' });
    }

    return next();
  };
}

module.exports = { authenticate, requireRoles };
