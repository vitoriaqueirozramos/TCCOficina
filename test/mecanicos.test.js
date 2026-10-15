require('dotenv').config();

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { getPool } = require('../src/config/database');

const baseUrl = 'http://127.0.0.1:3000';

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

async function createMechanicUser() {
  const [perfilRows] = await getPool().execute(
    'SELECT id_perfil FROM perfis WHERE nome = ? LIMIT 1',
    ['MECANICO']
  );

  assert.ok(perfilRows.length > 0, 'mechanic profile should exist');

  const email = `mecanico.${Date.now()}@example.com`;
  const [result] = await getPool().execute(
    `INSERT INTO usuarios (id_perfil, nome, email, senha_hash, ativo)
     VALUES (?, ?, ?, ?, TRUE)`,
    [perfilRows[0].id_perfil, 'Mecânico Teste', email, '$2a$10$abcdefghijklmnopqrstuv']
  );

  return result.insertId;
}

test('create mechanic with admin session', async () => {
  const adminCookie = await getAdminCookie();
  const idUsuario = await createMechanicUser();

  const response = await fetch(`${baseUrl}/api/mecanicos`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Cookie: adminCookie
    },
    body: JSON.stringify({
      id_usuario: idUsuario,
      especialidade: 'Suspensão',
      ativo: true
    })
  });

  assert.equal(response.status, 201, 'mechanic creation should return 201');
  const payload = await response.json();
  assert.equal(payload.mecanico.id_usuario, idUsuario);
  assert.equal(payload.mecanico.especialidade, 'Suspensão');
});

test('list mechanics with admin session', async () => {
  const adminCookie = await getAdminCookie();
  const response = await fetch(`${baseUrl}/api/mecanicos`, {
    headers: { Cookie: adminCookie }
  });

  assert.equal(response.status, 200, 'mechanic list should return 200');
  const payload = await response.json();
  assert.ok(Array.isArray(payload.mecanicos), 'mechanic list should be an array');
  assert.ok(payload.mecanicos.length >= 1, 'mechanic list should contain at least one record');
});

test('get, update, search and synchronize mechanic account status', async () => {
  const adminCookie = await getAdminCookie();
  const idUsuario = await createMechanicUser();
  const createResponse = await fetch(`${baseUrl}/api/mecanicos`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({ id_usuario: idUsuario, especialidade: 'Freios', ativo: true })
  });
  const created = await createResponse.json();
  assert.equal(createResponse.status, 201);

  const updateResponse = await fetch(`${baseUrl}/api/mecanicos/${created.mecanico.id_mecanico}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({ especialidade: 'Freios ABS', ativo: false })
  });
  const updated = await updateResponse.json();
  assert.equal(updateResponse.status, 200);
  assert.equal(updated.mecanico.especialidade, 'Freios ABS');
  assert.equal(updated.mecanico.ativo, 0);

  const [userRows] = await getPool().execute('SELECT ativo FROM usuarios WHERE id_usuario = ?', [idUsuario]);
  assert.equal(userRows[0].ativo, 0, 'inactivating the mechanic should deactivate the linked account');

  const searchResponse = await fetch(`${baseUrl}/api/mecanicos?q=Freios%20ABS`, {
    headers: { Cookie: adminCookie }
  });
  const searched = await searchResponse.json();
  assert.ok(searched.mecanicos.some((mecanico) => mecanico.id_mecanico === created.mecanico.id_mecanico));
});
