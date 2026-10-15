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

test('create customer with admin session', async () => {
  const adminCookie = await getAdminCookie();
  const response = await fetch(`${baseUrl}/api/clientes`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Cookie: adminCookie
    },
    body: JSON.stringify({
      nome: 'João da Silva',
      documento: `CPF-${Date.now()}-1`,
      telefone: '(11) 99999-9999',
      email: `joao.${Date.now()}@example.com`,
      endereco: 'Rua das Flores, 123'
    })
  });

  assert.equal(response.status, 201, 'customer creation should return 201');
  const payload = await response.json();
  assert.equal(payload.cliente.nome, 'João da Silva');
  assert.ok(payload.cliente.id_cliente > 0, 'customer should have an id');
});

test('list customers with admin session', async () => {
  const adminCookie = await getAdminCookie();
  const response = await fetch(`${baseUrl}/api/clientes`, {
    headers: { Cookie: adminCookie }
  });

  assert.equal(response.status, 200, 'customer list should return 200');
  const payload = await response.json();
  assert.ok(Array.isArray(payload.clientes), 'customer list should be an array');
  assert.ok(payload.clientes.length >= 1, 'customer list should contain at least one record');
});

test('get, update, search and archive a customer without deleting it', async () => {
  const adminCookie = await getAdminCookie();
  const createResponse = await fetch(`${baseUrl}/api/clientes`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({
      nome: 'Cliente para editar',
      documento: `EDIT-${Date.now()}`,
      telefone: '(11) 90000-0000',
      email: `editar.${Date.now()}@example.com`,
      endereco: 'Rua Inicial, 1'
    })
  });
  const created = await createResponse.json();
  assert.equal(createResponse.status, 201);

  const updateResponse = await fetch(`${baseUrl}/api/clientes/${created.cliente.id_cliente}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({
      nome: 'Cliente atualizado',
      documento: created.cliente.documento,
      telefone: '(11) 91111-1111',
      email: created.cliente.email,
      endereco: 'Rua Atualizada, 2'
    })
  });
  const updated = await updateResponse.json();
  assert.equal(updateResponse.status, 200);
  assert.equal(updated.cliente.nome, 'Cliente atualizado');

  const searchResponse = await fetch(`${baseUrl}/api/clientes?q=${encodeURIComponent('Cliente atualizado')}`, {
    headers: { Cookie: adminCookie }
  });
  const searched = await searchResponse.json();
  assert.ok(searched.clientes.some((cliente) => cliente.id_cliente === created.cliente.id_cliente));

  const archiveResponse = await fetch(`${baseUrl}/api/clientes/${created.cliente.id_cliente}/ativo`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({ ativo: false })
  });
  assert.equal(archiveResponse.status, 200);

  const detailResponse = await fetch(`${baseUrl}/api/clientes/${created.cliente.id_cliente}`, {
    headers: { Cookie: adminCookie }
  });
  const detail = await detailResponse.json();
  assert.equal(detailResponse.status, 200);
  assert.equal(detail.cliente.ativo, 0);
});
