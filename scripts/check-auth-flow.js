require('dotenv').config({ quiet: true });

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');
const app = require('../src/app');
const { closePool } = require('../src/config/database');

async function waitForServer(server) {
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
}

async function closeServer(server) {
  if (server?.listening) {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });
  let userId;
  let server;

  try {
    const [[profile]] = await connection.query(
      "SELECT id_perfil FROM perfis WHERE nome = 'ATENDENTE'"
    );
    assert.ok(profile, 'perfil ATENDENTE não encontrado');

    const email = `auth-check-${crypto.randomUUID()}@example.invalid`;
    const password = crypto.randomBytes(24).toString('base64url');
    const passwordHash = await bcrypt.hash(password, 4);
    const [insertResult] = await connection.execute(
      'INSERT INTO usuarios (id_perfil, nome, email, senha_hash) VALUES (?, ?, ?, ?)',
      [profile.id_perfil, 'Usuário temporário de integração', email, passwordHash]
    );
    userId = insertResult.insertId;

    server = app.listen(0, '127.0.0.1');
    await waitForServer(server);
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    const invalidLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: 'senha-incorreta' })
    });
    assert.equal(invalidLogin.status, 401);
    console.log('OK senha incorreta rejeitada');

    const login = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    assert.equal(login.status, 200);
    const cookieHeader = login.headers.get('set-cookie');
    assert.match(cookieHeader, /HttpOnly/i);
    assert.match(cookieHeader, /SameSite=Strict/i);
    const cookie = cookieHeader.split(';', 1)[0];
    const loginBody = await login.json();
    assert.equal(loginBody.user.email, email);
    assert.equal(Object.hasOwn(loginBody.user, 'senha_hash'), false);
    console.log('OK senha válida cria cookie HttpOnly e resposta sem hash');

    const account = await fetch(`${baseUrl}/api/auth/me`, { headers: { cookie } });
    assert.equal(account.status, 200);
    assert.equal((await account.json()).user.perfil, 'ATENDENTE');
    console.log('OK rota autenticada retorna perfil');

    await connection.execute('UPDATE usuarios SET ativo = FALSE WHERE id_usuario = ?', [userId]);
    const disabledAccount = await fetch(`${baseUrl}/api/auth/me`, { headers: { cookie } });
    assert.equal(disabledAccount.status, 401);
    console.log('OK usuário inativo perde acesso');
  } finally {
    await closeServer(server);
    if (userId) {
      await connection.execute('DELETE FROM usuarios WHERE id_usuario = ?', [userId]);
    }
    await connection.end();
    await closePool();
    console.log('Usuário temporário removido.');
  }
}

main().catch((error) => {
  console.error(`Verificação do login falhou: ${error.code || error.name}`);
  process.exitCode = 1;
});
