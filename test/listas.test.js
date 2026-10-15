require('dotenv').config();

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { getPool } = require('../src/config/database');

const baseUrl = 'http://127.0.0.1:3000';
const catalogs = [
  ['clientes', 'clientes'],
  ['veiculos', 'veiculos'],
  ['mecanicos', 'mecanicos'],
  ['servicos', 'servicos'],
  ['pecas', 'pecas']
];

async function getAdminCookie() {
  const { getJwtSecret } = require('../src/config/auth');
  const jwt = require('jsonwebtoken');
  const [rows] = await getPool().execute(
    `SELECT u.id_usuario
     FROM usuarios AS u
     JOIN perfis AS p ON p.id_perfil = u.id_perfil
     WHERE p.nome = 'ADMINISTRADOR' AND u.ativo = TRUE
     ORDER BY u.id_usuario ASC
     LIMIT 1`
  );

  assert.ok(rows.length > 0, 'an admin user should exist in the database');
  return 'oficinatech_token=' + jwt.sign({ sub: String(rows[0].id_usuario) }, getJwtSecret(), { expiresIn: '15m', issuer: 'oficinatech' });
}

test('catalog lists support pagination and active filters', async () => {
  const cookie = await getAdminCookie();

  for (const [route, collection] of catalogs) {
    const response = await fetch(`${baseUrl}/api/${route}?page=1&limit=1&ativo=`, {
      headers: { Cookie: cookie }
    });
    assert.equal(response.status, 200, `${route} list should accept pagination`);
    const payload = await response.json();
    assert.ok(Array.isArray(payload[collection]), `${route} response should preserve its collection array`);
    assert.ok(payload[collection].length <= 1, `${route} page should not exceed its limit`);
    assert.equal(payload.pagination.page, 1);
    assert.equal(payload.pagination.limit, 1);
    assert.equal(payload.pagination.pages, payload.pagination.total);

    const filteredResponse = await fetch(`${baseUrl}/api/${route}?ativo=false&page=1&limit=5`, {
      headers: { Cookie: cookie }
    });
    assert.equal(filteredResponse.status, 200, `${route} list should accept active-state filtering`);
    const filtered = await filteredResponse.json();
    assert.ok(filtered[collection].every((item) => !item.ativo), `${route} inactive filter should only return inactive records`);
  }

  const invalidResponse = await fetch(`${baseUrl}/api/clientes?page=0&limit=101`, {
    headers: { Cookie: cookie }
  });
  assert.equal(invalidResponse.status, 400, 'invalid pagination bounds should be rejected');
});
