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

test('create service with admin session', async () => {
  const adminCookie = await getAdminCookie();
  const response = await fetch(`${baseUrl}/api/servicos`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Cookie: adminCookie
    },
    body: JSON.stringify({
      nome: 'Troca de óleo',
      descricao: 'Troca de óleo do motor e filtro',
      preco_atual: 249.90,
      ativo: true
    })
  });

  assert.equal(response.status, 201, 'service creation should return 201');
  const payload = await response.json();
  assert.equal(payload.servico.nome, 'Troca de óleo');
  assert.equal(Number(payload.servico.preco_atual), 249.9);
});

test('list services with admin session', async () => {
  const adminCookie = await getAdminCookie();
  const response = await fetch(`${baseUrl}/api/servicos`, {
    headers: { Cookie: adminCookie }
  });

  assert.equal(response.status, 200, 'service list should return 200');
  const payload = await response.json();
  assert.ok(Array.isArray(payload.servicos), 'service list should be an array');
  assert.ok(payload.servicos.length >= 1, 'service list should contain at least one record');
});

test('get, update, search and archive a service', async () => {
  const adminCookie = await getAdminCookie();
  const createResponse = await fetch(`${baseUrl}/api/servicos`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({ nome: `Serviço Editar ${Date.now()}`, descricao: 'Inicial', preco_atual: 25 })
  });
  const created = await createResponse.json();
  assert.equal(createResponse.status, 201);

  const updateResponse = await fetch(`${baseUrl}/api/servicos/${created.servico.id_servico}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({ nome: 'Serviço Atualizado', descricao: 'Atualizada', preco_atual: 35.5 })
  });
  const updated = await updateResponse.json();
  assert.equal(updateResponse.status, 200);
  assert.equal(Number(updated.servico.preco_atual), 35.5);

  const searchResponse = await fetch(`${baseUrl}/api/servicos?q=Servi%C3%A7o%20Atualizado`, {
    headers: { Cookie: adminCookie }
  });
  const searched = await searchResponse.json();
  assert.ok(searched.servicos.some((servico) => servico.id_servico === created.servico.id_servico));

  const archiveResponse = await fetch(`${baseUrl}/api/servicos/${created.servico.id_servico}/ativo`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({ ativo: false })
  });
  assert.equal(archiveResponse.status, 200);
});
