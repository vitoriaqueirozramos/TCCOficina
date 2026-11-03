require('dotenv').config();

const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
const { getPool } = require('../src/config/database');

const baseUrl = process.env.TEST_BASE_URL || 'http://127.0.0.1:3000';

async function createAttendantCookie() {
  const [profileRows] = await getPool().execute(
    'SELECT id_perfil FROM perfis WHERE nome = ? LIMIT 1',
    ['ATENDENTE']
  );
  assert.ok(profileRows.length > 0, 'attendant profile should exist');
  const [userResult] = await getPool().execute(
    `INSERT INTO usuarios (id_perfil, nome, email, senha_hash, ativo)
     VALUES (?, ?, ?, ?, TRUE)`,
    [profileRows[0].id_perfil, 'Camila Duarte', `camila.duarte.${randomUUID().slice(0, 8)}@example.com`, '$2a$10$abcdefghijklmnopqrstuv']
  );
  const { getJwtSecret } = require('../src/config/auth');
  const jwt = require('jsonwebtoken');
  return 'oficinatech_token=' + jwt.sign({ sub: String(userResult.insertId) }, getJwtSecret(), { expiresIn: '15m', issuer: 'oficinatech' });
}

test('attendant can access customer, vehicle, service-order, and dashboard workflows', async () => {
  const cookie = await createAttendantCookie();
  const endpoints = [
    '/api/clientes',
    '/api/veiculos',
    '/api/ordens-servico',
    '/api/dashboard/summary'
  ];

  for (const endpoint of endpoints) {
    const response = await fetch(`${baseUrl}${endpoint}`, { headers: { Cookie: cookie } });
    assert.equal(response.status, 200, `attendant should access ${endpoint}`);
  }
});
