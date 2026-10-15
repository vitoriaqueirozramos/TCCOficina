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

test('create part with admin session', async () => {
  const adminCookie = await getAdminCookie();
  const response = await fetch(`${baseUrl}/api/pecas`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Cookie: adminCookie
    },
    body: JSON.stringify({
      codigo: `PEC-${Date.now()}`,
      nome: 'Pastilha de freio',
      descricao: 'Pastilha dianteira',
      preco_atual: 129.90,
      estoque_minimo: 5,
      ativo: true
    })
  });

  assert.equal(response.status, 201, 'part creation should return 201');
  const payload = await response.json();
  assert.equal(payload.peca.codigo.startsWith('PEC-'), true);
  assert.equal(payload.peca.nome, 'Pastilha de freio');
});

test('list parts with admin session', async () => {
  const adminCookie = await getAdminCookie();
  const response = await fetch(`${baseUrl}/api/pecas`, {
    headers: { Cookie: adminCookie }
  });

  assert.equal(response.status, 200, 'part list should return 200');
  const payload = await response.json();
  assert.ok(Array.isArray(payload.pecas), 'part list should be an array');
  assert.ok(payload.pecas.length >= 1, 'part list should contain at least one record');
});

test('get, update, search and archive a part', async () => {
  const adminCookie = await getAdminCookie();
  const createResponse = await fetch(`${baseUrl}/api/pecas`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({
      codigo: `EDIT-${Date.now()}`,
      nome: 'Peça para editar',
      descricao: 'Inicial',
      preco_atual: 15,
      estoque_minimo: 2
    })
  });
  const created = await createResponse.json();
  assert.equal(createResponse.status, 201);

  const updateResponse = await fetch(`${baseUrl}/api/pecas/${created.peca.id_peca}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({
      codigo: created.peca.codigo,
      nome: 'Peça atualizada',
      descricao: 'Atualizada',
      preco_atual: 17.5,
      estoque_minimo: 4
    })
  });
  const updated = await updateResponse.json();
  assert.equal(updateResponse.status, 200);
  assert.equal(updated.peca.nome, 'Peça atualizada');

  const searchResponse = await fetch(`${baseUrl}/api/pecas?q=Pe%C3%A7a%20atualizada`, {
    headers: { Cookie: adminCookie }
  });
  const searched = await searchResponse.json();
  assert.ok(searched.pecas.some((peca) => peca.id_peca === created.peca.id_peca));

  const archiveResponse = await fetch(`${baseUrl}/api/pecas/${created.peca.id_peca}/ativo`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({ ativo: false })
  });
  assert.equal(archiveResponse.status, 200);
});
