const crypto = require('node:crypto');

const cookieName = 'oficinatech_token';
const tokenLifetimeMs = 15 * 60 * 1000;
let developmentSecret;

function getJwtSecret() {
  const configuredSecret = process.env.JWT_SECRET;
  if (configuredSecret && configuredSecret.length >= 32) {
    return configuredSecret;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET with at least 32 characters is required in production.');
  }

  developmentSecret ??= crypto.randomBytes(32).toString('hex');
  return developmentSecret;
}

function authCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api',
    maxAge: tokenLifetimeMs
  };
}

function clearAuthCookie(response) {
  const { maxAge, ...options } = authCookieOptions();
  response.clearCookie(cookieName, options);
}

module.exports = { authCookieOptions, clearAuthCookie, cookieName, getJwtSecret, tokenLifetimeMs };
