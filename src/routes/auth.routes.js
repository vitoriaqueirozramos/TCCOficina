const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { getPool } = require('../config/database');
const { authCookieOptions, clearAuthCookie, cookieName, getJwtSecret } = require('../config/auth');
const { authenticate } = require('../middleware/auth.middleware');

const router = express.Router();
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_request, response) => {
    response.status(429).json({ error: 'Muitas tentativas. Tente novamente em 15 minutos.' });
  }
});

router.post('/login', loginLimiter, async (request, response, next) => {
  const email = typeof request.body?.email === 'string' ? request.body.email.trim().toLowerCase() : '';
  const password = typeof request.body?.password === 'string' ? request.body.password : '';

  if (!email || email.length > 254 || !password || password.length > 256) {
    return response.status(400).json({ error: 'Informe um e-mail e uma senha válidos.' });
  }

  try {
    const [users] = await getPool().execute(
      `SELECT u.id_usuario, u.nome, u.email, u.senha_hash, p.nome AS perfil
       FROM usuarios AS u
       JOIN perfis AS p ON p.id_perfil = u.id_perfil
       WHERE u.email = ? AND u.ativo = TRUE
       LIMIT 1`,
      [email]
    );
    const user = users[0];
    const passwordMatches = user ? await bcrypt.compare(password, user.senha_hash) : false;

    if (!passwordMatches) {
      return response.status(401).json({ error: 'E-mail ou senha incorretos.' });
    }

    const token = jwt.sign(
      { sub: String(user.id_usuario) },
      getJwtSecret(),
      { expiresIn: '15m', issuer: 'oficinatech' }
    );

    response.cookie(cookieName, token, authCookieOptions());
    return response.json({
      user: {
        id_usuario: user.id_usuario,
        nome: user.nome,
        email: user.email,
        perfil: user.perfil
      }
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/logout', (_request, response) => {
  clearAuthCookie(response);
  response.status(204).end();
});

router.get('/me', authenticate, (request, response) => {
  response.json({ user: request.user });
});

module.exports = router;
