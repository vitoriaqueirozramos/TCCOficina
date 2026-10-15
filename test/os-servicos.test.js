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

async function createOrder() {
  const adminCookie = await getAdminCookie();

  const customerResponse = await fetch(`${baseUrl}/api/clientes`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({
      nome: 'Cliente OS Serviço',
      documento: `DOC-OS-${randomUUID().slice(0, 10).toUpperCase()}`,
      telefone: '(11) 98888-2222',
      email: `clienteosservico.${randomUUID().slice(0, 8)}@example.com`,
      endereco: 'Rua do Serviço, 220'
    })
  });

  const customerPayload = await customerResponse.json();
  assert.equal(customerResponse.status, 201, 'customer creation should succeed for service item test');

  const vehicleResponse = await fetch(`${baseUrl}/api/veiculos`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({
      id_cliente: customerPayload.cliente.id_cliente,
      placa: `SS${randomUUID().slice(0, 5).toUpperCase()}`,
      chassi: `CH-${randomUUID().slice(0, 12).toUpperCase()}`,
      marca: 'Chevrolet',
      modelo: 'Onix',
      ano: 2022,
      cor: 'Vermelho'
    })
  });

  const vehiclePayload = await vehicleResponse.json();
  assert.equal(vehicleResponse.status, 201, 'vehicle creation should succeed for service item test');

  const orderResponse = await fetch(`${baseUrl}/api/ordens-servico`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({
      id_cliente: customerPayload.cliente.id_cliente,
      id_veiculo: vehiclePayload.veiculo.id_veiculo,
      diagnostico: 'Teste de serviço',
      observacoes: 'Sem observações'
    })
  });

  const orderPayload = await orderResponse.json();
  assert.equal(orderResponse.status, 201, 'service order creation should succeed for item test');
  return orderPayload.ordem.id_os;
}

async function createService() {
  const adminCookie = await getAdminCookie();
  const response = await fetch(`${baseUrl}/api/servicos`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({
      nome: 'Balanceamento',
      descricao: 'Balanceamento de rodas',
      preco_atual: 120,
      ativo: true
    })
  });

  const payload = await response.json();
  assert.equal(response.status, 201, 'service creation should succeed for item test');
  return payload.servico.id_servico;
}

test('create order service item with admin session', async () => {
  const adminCookie = await getAdminCookie();
  const idOs = await createOrder();
  const idServico = await createService();

  const response = await fetch(`${baseUrl}/api/ordens-servico/${idOs}/os-servicos`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Cookie: adminCookie
    },
    body: JSON.stringify({
      id_servico: idServico,
      descricao_snapshot: 'Balanceamento de rodas',
      quantidade: 1,
      valor_unitario: 120.00
    })
  });

  assert.equal(response.status, 201, 'order service item creation should return 201');
  const payload = await response.json();
  assert.equal(payload.item.id_os, idOs);
  assert.equal(payload.item.id_servico, idServico);
});

test('list order service items with admin session', async () => {
  const adminCookie = await getAdminCookie();
  const idOs = await createOrder();
  const idServico = await createService();

  await fetch(`${baseUrl}/api/ordens-servico/${idOs}/os-servicos`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({
      id_servico: idServico,
      descricao_snapshot: 'Balanceamento de rodas',
      quantidade: 1,
      valor_unitario: 150.00
    })
  });

  const response = await fetch(`${baseUrl}/api/ordens-servico/${idOs}/os-servicos`, {
    headers: { Cookie: adminCookie }
  });

  assert.equal(response.status, 200, 'order service item list should return 200');
  const payload = await response.json();
  assert.ok(Array.isArray(payload.itens), 'order service item list should be an array');
  assert.ok(payload.itens.length >= 1, 'order service item list should have at least one item');
});

test('reject service items after order cancellation', async () => {
  const adminCookie = await getAdminCookie();
  const idOs = await createOrder();
  const idServico = await createService();
  const [statusRows] = await getPool().execute(
    'SELECT id_status_os FROM status_os WHERE codigo = ? LIMIT 1',
    ['CANCELADA']
  );
  const cancelResponse = await fetch(`${baseUrl}/api/ordens-servico/${idOs}/status`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({ id_status_os: statusRows[0].id_status_os })
  });
  assert.equal(cancelResponse.status, 200);

  const response = await fetch(`${baseUrl}/api/ordens-servico/${idOs}/os-servicos`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({
      id_servico: idServico,
      descricao_snapshot: 'Serviço após encerramento',
      quantidade: 1,
      valor_unitario: 10
    })
  });
  assert.equal(response.status, 409, 'terminal orders should reject service items');
});

test('edit and logically remove service items from an open order', async () => {
  const adminCookie = await getAdminCookie();
  const idOs = await createOrder();
  const idServico = await createService();
  const createResponse = await fetch(`${baseUrl}/api/ordens-servico/${idOs}/os-servicos`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({
      id_servico: idServico,
      descricao_snapshot: 'Balanceamento',
      quantidade: 1,
      valor_unitario: 120
    })
  });
  const created = await createResponse.json();
  assert.equal(createResponse.status, 201);

  const updateResponse = await fetch(`${baseUrl}/api/ordens-servico/${idOs}/os-servicos/${created.item.id_os_servico}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({ descricao_snapshot: 'Balanceamento atualizado', quantidade: 2, valor_unitario: 90 })
  });
  assert.equal(updateResponse.status, 200);
  const updated = await updateResponse.json();
  assert.equal(Number(updated.item.quantidade), 2);

  let detailResponse = await fetch(`${baseUrl}/api/ordens-servico/${idOs}`, { headers: { Cookie: adminCookie } });
  let detail = await detailResponse.json();
  assert.equal(Number(detail.ordem.valor_total), 180);

  const deleteResponse = await fetch(`${baseUrl}/api/ordens-servico/${idOs}/os-servicos/${created.item.id_os_servico}`, {
    method: 'DELETE',
    headers: { Cookie: adminCookie }
  });
  assert.equal(deleteResponse.status, 204);

  const listResponse = await fetch(`${baseUrl}/api/ordens-servico/${idOs}/os-servicos`, { headers: { Cookie: adminCookie } });
  const list = await listResponse.json();
  assert.equal(list.itens.length, 0);
  detailResponse = await fetch(`${baseUrl}/api/ordens-servico/${idOs}`, { headers: { Cookie: adminCookie } });
  detail = await detailResponse.json();
  assert.equal(Number(detail.ordem.valor_total), 0);
});
