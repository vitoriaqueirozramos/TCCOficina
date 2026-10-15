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

async function seedCustomerVehicleAndMechanic() {
  const adminCookie = await getAdminCookie();

  const customerResponse = await fetch(`${baseUrl}/api/clientes`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({
      nome: 'Cliente OS',
      documento: `DOC-OS-${Date.now()}`,
      telefone: '(11) 91234-4321',
      email: `clienteos.${Date.now()}@example.com`,
      endereco: 'Rua da OS, 123'
    })
  });

  const customerPayload = await customerResponse.json();
  assert.equal(customerResponse.status, 201, 'customer creation should succeed for order setup');

  const vehicleResponse = await fetch(`${baseUrl}/api/veiculos`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({
      id_cliente: customerPayload.cliente.id_cliente,
      placa: `OS${Date.now().toString().slice(-5)}`,
      chassi: `CHASSI-OS-${Date.now()}`,
      marca: 'Fiat',
      modelo: 'Uno',
      ano: 2021,
      cor: 'Azul'
    })
  });

  const vehiclePayload = await vehicleResponse.json();
  assert.equal(vehicleResponse.status, 201, 'vehicle creation should succeed for order setup');

  const [profileRows] = await getPool().execute('SELECT id_perfil FROM perfis WHERE nome = ? LIMIT 1', ['MECANICO']);
  assert.ok(profileRows.length > 0, 'mechanic profile should exist');

  const [mechanicUserResult] = await getPool().execute(
    `INSERT INTO usuarios (id_perfil, nome, email, senha_hash, ativo)
     VALUES (?, ?, ?, ?, TRUE)`,
    [profileRows[0].id_perfil, 'Mecânico OS', `mecanicoos.${Date.now()}@example.com`, '$2a$10$abcdefghijklmnopqrstuv']
  );

  const [mechanicResult] = await getPool().execute(
    `INSERT INTO mecanicos (id_usuario, especialidade, ativo)
     VALUES (?, ?, TRUE)`,
    [mechanicUserResult.insertId, 'Motor']
  );

  const [statusRows] = await getPool().execute(
    'SELECT id_status_os FROM status_os WHERE codigo = ? LIMIT 1',
    ['ABERTA']
  );

  return {
    id_cliente: customerPayload.cliente.id_cliente,
    id_veiculo: vehiclePayload.veiculo.id_veiculo,
    id_mecanico: mechanicResult.insertId,
    id_status_os: statusRows[0].id_status_os
  };
}

test('create service order with admin session', async () => {
  const adminCookie = await getAdminCookie();
  const payload = await seedCustomerVehicleAndMechanic();

  const response = await fetch(`${baseUrl}/api/ordens-servico`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Cookie: adminCookie
    },
    body: JSON.stringify({
      id_cliente: payload.id_cliente,
      id_veiculo: payload.id_veiculo,
      id_mecanico: payload.id_mecanico,
      id_status_os: payload.id_status_os,
      quilometragem_entrada: 45200,
      diagnostico: 'Problema no motor após falha de ignição.',
      observacoes: 'Cliente relatou tranco ao acelerar.',
      previsao_conclusao: new Date(Date.now() + 86400000).toISOString()
    })
  });

  assert.equal(response.status, 201, 'service order creation should return 201');
  const body = await response.json();
  assert.equal(body.ordem.id_cliente, payload.id_cliente);
  assert.equal(body.ordem.id_veiculo, payload.id_veiculo);
  assert.equal(body.ordem.id_status_os, payload.id_status_os);
});

test('list service orders with admin session', async () => {
  const adminCookie = await getAdminCookie();
  const response = await fetch(`${baseUrl}/api/ordens-servico`, {
    headers: { Cookie: adminCookie }
  });

  assert.equal(response.status, 200, 'service order list should return 200');
  const payload = await response.json();
  assert.ok(Array.isArray(payload.ordens), 'service order list should be an array');
  assert.ok(payload.ordens.length >= 1, 'service order list should contain at least one record');
});

test('new service orders cannot start in a terminal status', async () => {
  const adminCookie = await getAdminCookie();
  const payload = await seedCustomerVehicleAndMechanic();
  const [statusRows] = await getPool().execute(
    'SELECT id_status_os FROM status_os WHERE codigo = ? LIMIT 1',
    ['CANCELADA']
  );

  const response = await fetch(`${baseUrl}/api/ordens-servico`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({
      id_cliente: payload.id_cliente,
      id_veiculo: payload.id_veiculo,
      id_status_os: statusRows[0].id_status_os
    })
  });

  assert.equal(response.status, 400, 'a new service order should always start as open');
});
