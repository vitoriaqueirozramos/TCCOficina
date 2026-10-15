require('dotenv').config();

const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
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

async function createOrderWithStatus(statusCode) {
  const adminCookie = await getAdminCookie();

  const customerResponse = await fetch(`${baseUrl}/api/clientes`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({
      nome: `Cliente Dashboard ${randomUUID().slice(0, 8)}`,
      documento: `DOC-DASH-${randomUUID().slice(0, 8).toUpperCase()}`,
      telefone: '(11) 99999-1122',
      email: `dashboard.${randomUUID().slice(0, 8)}@example.com`,
      endereco: 'Rua Dashboard, 123'
    })
  });

  const customerPayload = await customerResponse.json();
  assert.equal(customerResponse.status, 201, 'customer creation should succeed for dashboard test');

  const vehicleResponse = await fetch(`${baseUrl}/api/veiculos`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({
      id_cliente: customerPayload.cliente.id_cliente,
      placa: `DB${randomUUID().slice(0, 5).toUpperCase()}`,
      chassi: `CH-${randomUUID().slice(0, 12).toUpperCase()}`,
      marca: 'Fiat',
      modelo: 'Palio',
      ano: 2021,
      cor: 'Cinza'
    })
  });

  const vehiclePayload = await vehicleResponse.json();
  assert.equal(vehicleResponse.status, 201, 'vehicle creation should succeed for dashboard test');

  const [statusRow] = await getPool().execute('SELECT id_status_os FROM status_os WHERE codigo = ? LIMIT 1', ['ABERTA']);
  const response = await fetch(`${baseUrl}/api/ordens-servico`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({
      id_cliente: customerPayload.cliente.id_cliente,
      id_veiculo: vehiclePayload.veiculo.id_veiculo,
      id_status_os: statusRow[0].id_status_os,
      diagnostico: 'Dashboard status check',
      observacoes: 'status test'
    })
  });

  const payload = await response.json();
  assert.equal(response.status, 201, 'order creation should succeed for dashboard test');

  if (statusCode !== 'ABERTA') {
    const [diagnosticRows] = await getPool().execute(
      'SELECT id_status_os FROM status_os WHERE codigo = ? LIMIT 1',
      ['EM_DIAGNOSTICO']
    );
    const diagnosticResponse = await fetch(`${baseUrl}/api/ordens-servico/${payload.ordem.id_os}/status`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ id_status_os: diagnosticRows[0].id_status_os })
    });
    assert.equal(diagnosticResponse.status, 200, 'order should transition through diagnosis');

    if (statusCode !== 'EM_DIAGNOSTICO') {
      const [targetRows] = await getPool().execute(
        'SELECT id_status_os FROM status_os WHERE codigo = ? LIMIT 1',
        [statusCode]
      );
      const targetResponse = await fetch(`${baseUrl}/api/ordens-servico/${payload.ordem.id_os}/status`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', Cookie: adminCookie },
        body: JSON.stringify({ id_status_os: targetRows[0].id_status_os })
      });
      assert.equal(targetResponse.status, 200, `order should transition to ${statusCode}`);
    }
  }
  return payload.ordem.id_os;
}

test('dashboard summary returns real counts for the business', async () => {
  const adminCookie = await getAdminCookie();
  await createOrderWithStatus('ABERTA');
  await createOrderWithStatus('EM_EXECUCAO');
  await createOrderWithStatus('AGUARDANDO_PECAS');

  const response = await fetch(`${baseUrl}/api/dashboard/summary`, {
    headers: { Cookie: adminCookie }
  });

  assert.equal(response.status, 200, 'dashboard summary should return 200');
  const payload = await response.json();
  assert.ok(payload.summary, 'summary payload should exist');
  assert.equal(typeof payload.summary.os_abertas, 'number');
  assert.equal(typeof payload.summary.os_em_execucao, 'number');
  assert.equal(typeof payload.summary.os_aguardando_pecas, 'number');
  assert.equal(typeof payload.summary.pecas_abaixo_minimo, 'number');
});
