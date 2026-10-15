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

async function createCustomer(cookie) {
  const response = await fetch(`${baseUrl}/api/clientes`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Cookie: cookie
    },
    body: JSON.stringify({
      nome: 'Maria Oliveira',
      documento: `DOC-${Date.now()}-2`,
      telefone: '(11) 98888-7777',
      email: `maria.${Date.now()}@example.com`,
      endereco: 'Rua do Sol, 77'
    })
  });

  assert.equal(response.status, 201, 'customer creation should succeed');
  const payload = await response.json();
  return payload.cliente.id_cliente;
}

test('create vehicle linked to a customer', async () => {
  const adminCookie = await getAdminCookie();
  const clientId = await createCustomer(adminCookie);
  const placa = `ABC${Date.now().toString().slice(-5)}`;

  const response = await fetch(`${baseUrl}/api/veiculos`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Cookie: adminCookie
    },
    body: JSON.stringify({
      id_cliente: clientId,
      placa,
      chassi: `CHASSI-${Date.now()}`,
      marca: 'Volkswagen',
      modelo: 'Gol',
      ano: 2020,
      cor: 'Prata'
    })
  });

  assert.equal(response.status, 201, 'vehicle creation should return 201');
  const payload = await response.json();
  assert.equal(payload.veiculo.placa, placa);
  assert.equal(payload.veiculo.id_cliente, clientId);
});

test('list vehicles with admin session', async () => {
  const adminCookie = await getAdminCookie();
  const response = await fetch(`${baseUrl}/api/veiculos`, {
    headers: { Cookie: adminCookie }
  });

  assert.equal(response.status, 200, 'vehicle list should return 200');
  const payload = await response.json();
  assert.ok(Array.isArray(payload.veiculos), 'vehicle list should be an array');
  assert.ok(payload.veiculos.length >= 1, 'vehicle list should contain at least one record');
});

test('get, update, search and archive a vehicle', async () => {
  const adminCookie = await getAdminCookie();
  const idCliente = await createCustomer(adminCookie);
  const createResponse = await fetch(`${baseUrl}/api/veiculos`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({
      id_cliente: idCliente,
      placa: `ED${Date.now().toString().slice(-6)}`,
      chassi: `VEH-${Date.now()}`,
      marca: 'Honda',
      modelo: 'Civic',
      ano: 2022,
      cor: 'Cinza'
    })
  });
  const created = await createResponse.json();
  assert.equal(createResponse.status, 201);

  const updateResponse = await fetch(`${baseUrl}/api/veiculos/${created.veiculo.id_veiculo}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({
      id_cliente: idCliente,
      placa: created.veiculo.placa,
      chassi: created.veiculo.chassi,
      marca: 'Honda',
      modelo: 'Civic Touring',
      ano: 2023,
      cor: 'Preto'
    })
  });
  const updated = await updateResponse.json();
  assert.equal(updateResponse.status, 200);
  assert.equal(updated.veiculo.modelo, 'Civic Touring');

  const searchResponse = await fetch(`${baseUrl}/api/veiculos?q=Civic%20Touring`, {
    headers: { Cookie: adminCookie }
  });
  const searched = await searchResponse.json();
  assert.ok(searched.veiculos.some((veiculo) => veiculo.id_veiculo === created.veiculo.id_veiculo));

  const archiveResponse = await fetch(`${baseUrl}/api/veiculos/${created.veiculo.id_veiculo}/ativo`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({ ativo: false })
  });
  assert.equal(archiveResponse.status, 200);
  const detailResponse = await fetch(`${baseUrl}/api/veiculos/${created.veiculo.id_veiculo}`, {
    headers: { Cookie: adminCookie }
  });
  const detail = await detailResponse.json();
  assert.equal(detailResponse.status, 200);
  assert.equal(detail.veiculo.ativo, 0);
});
