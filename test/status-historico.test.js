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
      nome: `Cliente Status ${randomUUID().slice(0, 8)}`,
      documento: `DOC-${randomUUID().slice(0, 8).toUpperCase()}`,
      telefone: '(11) 98888-0000',
      email: `status.${randomUUID().slice(0, 8)}@example.com`,
      endereco: 'Rua Status, 12'
    })
  });

  const customerPayload = await customerResponse.json();
  assert.equal(customerResponse.status, 201, 'customer creation should succeed for status history test');

  const vehicleResponse = await fetch(`${baseUrl}/api/veiculos`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({
      id_cliente: customerPayload.cliente.id_cliente,
      placa: `ST${randomUUID().slice(0, 5).toUpperCase()}`,
      chassi: `CH-${randomUUID().slice(0, 8).toUpperCase()}`,
      marca: 'Ford',
      modelo: 'Ka',
      ano: 2024,
      cor: 'Azul'
    })
  });

  const vehiclePayload = await vehicleResponse.json();
  assert.equal(vehicleResponse.status, 201, 'vehicle creation should succeed for status history test');

  const orderResponse = await fetch(`${baseUrl}/api/ordens-servico`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({
      id_cliente: customerPayload.cliente.id_cliente,
      id_veiculo: vehiclePayload.veiculo.id_veiculo,
      diagnostico: 'Status test',
      observacoes: 'History test'
    })
  });

  const orderPayload = await orderResponse.json();
  assert.equal(orderResponse.status, 201, 'service order creation should succeed for status history test');
  return orderPayload.ordem.id_os;
}

test('update order status and persist status history', async () => {
  const adminCookie = await getAdminCookie();
  const idOs = await createOrder();

  const statusRows = await getPool().execute('SELECT id_status_os FROM status_os WHERE codigo = ? LIMIT 1', ['EM_DIAGNOSTICO']);
  const response = await fetch(`${baseUrl}/api/ordens-servico/${idOs}/status`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Cookie: adminCookie
    },
    body: JSON.stringify({
      id_status_os: statusRows[0][0].id_status_os,
      observacao: 'Em diagnóstico'
    })
  });

  assert.equal(response.status, 200, 'status update should return 200');
  const payload = await response.json();
  assert.equal(payload.ordem.id_os, idOs);
  assert.ok(Array.isArray(payload.historico), 'status history should be present');
  assert.ok(payload.historico.length >= 1, 'status history should contain at least one entry');
});

test('reject invalid status transitions and completion without items', async () => {
  const adminCookie = await getAdminCookie();
  const idOs = await createOrder();
  const [statusRows] = await getPool().execute(
    'SELECT id_status_os FROM status_os WHERE codigo = ? LIMIT 1',
    ['CONCLUIDA']
  );

  const response = await fetch(`${baseUrl}/api/ordens-servico/${idOs}/status`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({ id_status_os: statusRows[0].id_status_os })
  });

  assert.equal(response.status, 409, 'an order without items cannot transition directly to completed');
  const [orderRows] = await getPool().execute(
    `SELECT status_os.codigo AS status_codigo
     FROM ordens_servico AS os
     JOIN status_os ON status_os.id_status_os = os.id_status_os
     WHERE os.id_os = ?`,
    [idOs]
  );
  const [historyRows] = await getPool().execute(
    'SELECT id_historico_status FROM historico_status_os WHERE id_os = ?',
    [idOs]
  );
  assert.equal(orderRows[0].status_codigo, 'ABERTA', 'rejected transition should leave current status unchanged');
  assert.equal(historyRows.length, 0, 'rejected transition should not create history');
});

test('complete an order with items and persist completion timestamp', async () => {
  const adminCookie = await getAdminCookie();
  const idOs = await createOrder();
  const serviceResponse = await fetch(`${baseUrl}/api/servicos`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({
      nome: `Serviço Conclusão ${randomUUID().slice(0, 6)}`,
      descricao: 'Serviço de teste de conclusão',
      preco_atual: 90.00
    })
  });
  const servicePayload = await serviceResponse.json();
  assert.equal(serviceResponse.status, 201);

  const itemResponse = await fetch(`${baseUrl}/api/ordens-servico/${idOs}/os-servicos`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({
      id_servico: servicePayload.servico.id_servico,
      descricao_snapshot: servicePayload.servico.nome,
      quantidade: 1,
      valor_unitario: servicePayload.servico.preco_atual
    })
  });
  assert.equal(itemResponse.status, 201);

  for (const codigo of ['EM_DIAGNOSTICO', 'EM_EXECUCAO', 'CONCLUIDA']) {
    const [statusRows] = await getPool().execute(
      'SELECT id_status_os FROM status_os WHERE codigo = ? LIMIT 1',
      [codigo]
    );
    const response = await fetch(`${baseUrl}/api/ordens-servico/${idOs}/status`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ id_status_os: statusRows[0].id_status_os })
    });
    assert.equal(response.status, 200, `transition to ${codigo} should succeed`);
  }

  const [orderRows] = await getPool().execute(
    'SELECT concluida_em FROM ordens_servico WHERE id_os = ?',
    [idOs]
  );
  assert.ok(orderRows[0].concluida_em, 'completed order should persist completion timestamp');
});

test('list status history for an order', async () => {
  const adminCookie = await getAdminCookie();
  const idOs = await createOrder();

  const statusRows = await getPool().execute('SELECT id_status_os FROM status_os WHERE codigo = ? LIMIT 1', ['EM_DIAGNOSTICO']);
  await fetch(`${baseUrl}/api/ordens-servico/${idOs}/status`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Cookie: adminCookie
    },
    body: JSON.stringify({
      id_status_os: statusRows[0][0].id_status_os,
      observacao: 'Primeira transição'
    })
  });

  const response = await fetch(`${baseUrl}/api/ordens-servico/${idOs}/historico-status`, {
    headers: { Cookie: adminCookie }
  });

  assert.equal(response.status, 200, 'status history list should return 200');
  const payload = await response.json();
  assert.ok(Array.isArray(payload.historico), 'status history list should be an array');
  assert.ok(payload.historico.length >= 1, 'status history list should have at least one item');
});

test('list vehicle history with orders, services and parts', async () => {
  const adminCookie = await getAdminCookie();

  const customerResponse = await fetch(`${baseUrl}/api/clientes`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({
      nome: `Cliente Veículo ${randomUUID().slice(0, 6)}`,
      documento: `DOC-VEH-${randomUUID().slice(0, 8).toUpperCase()}`,
      telefone: '(11) 97777-0000',
      email: `veiculo.${randomUUID().slice(0, 8)}@example.com`,
      endereco: 'Rua Histórico, 18'
    })
  });

  const customerPayload = await customerResponse.json();
  assert.equal(customerResponse.status, 201, 'customer creation should succeed for vehicle history test');

  const vehicleResponse = await fetch(`${baseUrl}/api/veiculos`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({
      id_cliente: customerPayload.cliente.id_cliente,
      placa: `VH${randomUUID().slice(0, 5).toUpperCase()}`,
      chassi: `VH-${randomUUID().slice(0, 8).toUpperCase()}`,
      marca: 'Chevrolet',
      modelo: 'Onix',
      ano: 2023,
      cor: 'Prata'
    })
  });

  const vehiclePayload = await vehicleResponse.json();
  assert.equal(vehicleResponse.status, 201, 'vehicle creation should succeed for vehicle history test');

  const serviceResponse = await fetch(`${baseUrl}/api/servicos`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({
      nome: `Serviço Histórico ${randomUUID().slice(0, 6)}`,
      descricao: 'Serviço para histórico do veículo',
      preco_atual: 120.00
    })
  });

  const servicePayload = await serviceResponse.json();
  assert.equal(serviceResponse.status, 201, 'service creation should succeed for vehicle history test');

  const partResponse = await fetch(`${baseUrl}/api/pecas`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({
      codigo: `P-${randomUUID().slice(0, 8).toUpperCase()}`,
      nome: `Peça Histórico ${randomUUID().slice(0, 5)}`,
      descricao: 'Peça para histórico do veículo',
      preco_atual: 45.5,
      estoque_minimo: 1
    })
  });

  const partPayload = await partResponse.json();
  assert.equal(partResponse.status, 201, 'part creation should succeed for vehicle history test');

  const stockResponse = await fetch(`${baseUrl}/api/estoque/movimentos`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({
      id_peca: partPayload.peca.id_peca,
      quantidade_delta: 2,
      motivo: 'ENTRADA',
      observacao: 'Estoque para teste de histórico'
    })
  });
  assert.equal(stockResponse.status, 201, 'stock entry should succeed for vehicle history test');

  const orderResponse = await fetch(`${baseUrl}/api/ordens-servico`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({
      id_cliente: customerPayload.cliente.id_cliente,
      id_veiculo: vehiclePayload.veiculo.id_veiculo,
      diagnostico: 'Histórico do veículo',
      observacoes: 'Revisar histórico'
    })
  });

  const orderPayload = await orderResponse.json();
  assert.equal(orderResponse.status, 201, 'service order creation should succeed for vehicle history test');

  const orderServiceResponse = await fetch(`${baseUrl}/api/ordens-servico/${orderPayload.ordem.id_os}/os-servicos`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({
      id_servico: servicePayload.servico.id_servico,
      descricao_snapshot: servicePayload.servico.nome,
      quantidade: 1,
      valor_unitario: servicePayload.servico.preco_atual
    })
  });

  assert.equal(orderServiceResponse.status, 201, 'order service item should be created for vehicle history test');

  const orderPartResponse = await fetch(`${baseUrl}/api/ordens-servico/${orderPayload.ordem.id_os}/os-pecas`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({
      id_peca: partPayload.peca.id_peca,
      descricao_snapshot: partPayload.peca.nome,
      quantidade: 2,
      valor_unitario: partPayload.peca.preco_atual
    })
  });

  assert.equal(orderPartResponse.status, 201, 'order part item should be created for vehicle history test');

  const response = await fetch(`${baseUrl}/api/veiculos/${vehiclePayload.veiculo.id_veiculo}/historico`, {
    headers: { Cookie: adminCookie }
  });

  assert.equal(response.status, 200, 'vehicle history should return 200');
  const payload = await response.json();
  assert.ok(payload.veiculo, 'vehicle history payload should include the vehicle');
  assert.ok(Array.isArray(payload.ordens), 'vehicle history should include orders array');
  assert.ok(payload.ordens.length >= 1, 'vehicle history should contain at least one order');
  assert.ok(Array.isArray(payload.ordens[0].servicos), 'order service list should be present');
  assert.ok(Array.isArray(payload.ordens[0].pecas), 'order part list should be present');
});
