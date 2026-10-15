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
      nome: 'Cliente OS Peça',
      documento: `DOC-PECA-${randomUUID().slice(0, 10).toUpperCase()}`,
      telefone: '(11) 97777-4444',
      email: `clienteospeca.${randomUUID().slice(0, 8)}@example.com`,
      endereco: 'Rua da Peça, 332'
    })
  });

  const customerPayload = await customerResponse.json();
  assert.equal(customerResponse.status, 201, 'customer creation should succeed for part item test');

  const vehicleResponse = await fetch(`${baseUrl}/api/veiculos`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({
      id_cliente: customerPayload.cliente.id_cliente,
      placa: `PP${randomUUID().slice(0, 5).toUpperCase()}`,
      chassi: `CH-${randomUUID().slice(0, 12).toUpperCase()}`,
      marca: 'Toyota',
      modelo: 'Corolla',
      ano: 2023,
      cor: 'Branco'
    })
  });

  const vehiclePayload = await vehicleResponse.json();
  assert.equal(vehicleResponse.status, 201, 'vehicle creation should succeed for part item test');

  const orderResponse = await fetch(`${baseUrl}/api/ordens-servico`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({
      id_cliente: customerPayload.cliente.id_cliente,
      id_veiculo: vehiclePayload.veiculo.id_veiculo,
      diagnostico: 'Teste de peça',
      observacoes: 'Sem observações'
    })
  });

  const orderPayload = await orderResponse.json();
  assert.equal(orderResponse.status, 201, 'service order creation should succeed for part item test');
  return orderPayload.ordem.id_os;
}

async function createPart() {
  const adminCookie = await getAdminCookie();
  const response = await fetch(`${baseUrl}/api/pecas`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({
      codigo: `PEC-${randomUUID().slice(0, 8)}`,
      nome: 'Filtro de combustível',
      descricao: 'Filtro de combustível para veículo',
      preco_atual: 80.00,
      estoque_minimo: 2,
      ativo: true
    })
  });

  const payload = await response.json();
  assert.equal(response.status, 201, 'part creation should succeed for item test');
  return payload.peca.id_peca;
}

async function addStock(idPeca, quantidade) {
  const adminCookie = await getAdminCookie();
  const response = await fetch(`${baseUrl}/api/estoque/movimentos`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({
      id_peca: idPeca,
      quantidade_delta: quantidade,
      motivo: 'ENTRADA',
      observacao: 'Estoque para teste de OS'
    })
  });

  assert.equal(response.status, 201, 'stock entry should succeed for order part test');
}

test('create order part item with admin session', async () => {
  const adminCookie = await getAdminCookie();
  const idOs = await createOrder();
  const idPeca = await createPart();
  await addStock(idPeca, 3);

  const response = await fetch(`${baseUrl}/api/ordens-servico/${idOs}/os-pecas`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Cookie: adminCookie
    },
    body: JSON.stringify({
      id_peca: idPeca,
      descricao_snapshot: 'Filtro de combustível',
      quantidade: 2,
      valor_unitario: 80.00
    })
  });

  assert.equal(response.status, 201, 'order part item creation should return 201');
  const payload = await response.json();
  assert.equal(payload.item.id_os, idOs);
  assert.equal(payload.item.id_peca, idPeca);

  const [movementRows] = await getPool().execute(
    `SELECT quantidade_delta, motivo
     FROM movimentos_estoque
     WHERE id_os_peca = ?`,
    [payload.item.id_os_peca]
  );
  assert.deepEqual(movementRows, [{ quantidade_delta: -2, motivo: 'CONSUMO_OS' }]);

  const [balanceRows] = await getPool().execute(
    'SELECT saldo_atual FROM vw_saldo_estoque WHERE id_peca = ?',
    [idPeca]
  );
  assert.equal(Number(balanceRows[0].saldo_atual), 1);

  const orderResponse = await fetch(`${baseUrl}/api/ordens-servico/${idOs}`, {
    headers: { Cookie: adminCookie }
  });
  assert.equal(orderResponse.status, 200, 'order detail should be available');
  const orderPayload = await orderResponse.json();
  assert.equal(Number(orderPayload.ordem.valor_total), 160, 'order total should include quantity times unit price');
});

test('reject order part item when stock is insufficient without partial writes', async () => {
  const adminCookie = await getAdminCookie();
  const idOs = await createOrder();
  const idPeca = await createPart();

  const response = await fetch(`${baseUrl}/api/ordens-servico/${idOs}/os-pecas`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({
      id_peca: idPeca,
      descricao_snapshot: 'Filtro de combustível',
      quantidade: 1,
      valor_unitario: 50.00
    })
  });

  assert.equal(response.status, 409, 'insufficient stock should return a conflict');
  const [itemRows] = await getPool().execute('SELECT id_os_peca FROM os_pecas WHERE id_os = ?', [idOs]);
  const [movementRows] = await getPool().execute('SELECT id_movimento FROM movimentos_estoque WHERE id_peca = ?', [idPeca]);
  assert.equal(itemRows.length, 0, 'failed stock validation should not create an order item');
  assert.equal(movementRows.length, 0, 'failed stock validation should not create a stock movement');
});

test('serialize concurrent stock consumption across service orders', async () => {
  const adminCookie = await getAdminCookie();
  const firstOrderId = await createOrder();
  const secondOrderId = await createOrder();
  const idPeca = await createPart();
  await addStock(idPeca, 1);

  const createItem = (idOs) => fetch(`${baseUrl}/api/ordens-servico/${idOs}/os-pecas`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({
      id_peca: idPeca,
      descricao_snapshot: 'Filtro de combustível',
      quantidade: 1,
      valor_unitario: 50.00
    })
  });
  const responses = await Promise.all([createItem(firstOrderId), createItem(secondOrderId)]);
  assert.deepEqual(responses.map((response) => response.status).sort(), [201, 409]);

  const [balanceRows] = await getPool().execute(
    'SELECT saldo_atual FROM vw_saldo_estoque WHERE id_peca = ?',
    [idPeca]
  );
  const [movementRows] = await getPool().execute(
    `SELECT id_movimento FROM movimentos_estoque
     WHERE id_peca = ? AND motivo = 'CONSUMO_OS'`,
    [idPeca]
  );
  const [itemRows] = await getPool().execute('SELECT id_os_peca FROM os_pecas WHERE id_peca = ?', [idPeca]);
  assert.equal(Number(balanceRows[0].saldo_atual), 0);
  assert.equal(movementRows.length, 1);
  assert.equal(itemRows.length, 1);
});

test('canceling an order restores consumed parts and closes further item changes', async () => {
  const adminCookie = await getAdminCookie();
  const idOs = await createOrder();
  const idPeca = await createPart();
  await addStock(idPeca, 2);

  const itemResponse = await fetch(`${baseUrl}/api/ordens-servico/${idOs}/os-pecas`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({
      id_peca: idPeca,
      descricao_snapshot: 'Filtro de combustível',
      quantidade: 2,
      valor_unitario: 50.00
    })
  });
  const itemPayload = await itemResponse.json();
  assert.equal(itemResponse.status, 201);

  const [cancelStatusRows] = await getPool().execute(
    'SELECT id_status_os FROM status_os WHERE codigo = ? LIMIT 1',
    ['CANCELADA']
  );
  const cancelResponse = await fetch(`${baseUrl}/api/ordens-servico/${idOs}/status`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({ id_status_os: cancelStatusRows[0].id_status_os })
  });
  assert.equal(cancelResponse.status, 200, 'order cancellation should succeed');

  const [balanceRows] = await getPool().execute(
    'SELECT saldo_atual FROM vw_saldo_estoque WHERE id_peca = ?',
    [idPeca]
  );
  assert.equal(Number(balanceRows[0].saldo_atual), 2, 'cancellation should restore consumed stock');

  const [movementRows] = await getPool().execute(
    'SELECT motivo, quantidade_delta FROM movimentos_estoque WHERE id_os_peca = ? ORDER BY id_movimento',
    [itemPayload.item.id_os_peca]
  );
  assert.deepEqual(movementRows, [
    { motivo: 'CONSUMO_OS', quantidade_delta: -2 },
    { motivo: 'ESTORNO', quantidade_delta: 2 }
  ]);

  const changeResponse = await fetch(`${baseUrl}/api/ordens-servico/${idOs}/os-pecas`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({
      id_peca: idPeca,
      descricao_snapshot: 'Filtro adicional',
      quantidade: 1,
      valor_unitario: 50.00
    })
  });
  assert.equal(changeResponse.status, 409, 'terminal orders should reject new parts');
});

test('edit and logically remove a part item with stock compensation', async () => {
  const adminCookie = await getAdminCookie();
  const idOs = await createOrder();
  const idPeca = await createPart();
  await addStock(idPeca, 4);
  const createResponse = await fetch(`${baseUrl}/api/ordens-servico/${idOs}/os-pecas`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({
      id_peca: idPeca,
      descricao_snapshot: 'Filtro',
      quantidade: 2,
      valor_unitario: 50
    })
  });
  const created = await createResponse.json();
  assert.equal(createResponse.status, 201);

  const updateResponse = await fetch(`${baseUrl}/api/ordens-servico/${idOs}/os-pecas/${created.item.id_os_peca}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({ descricao_snapshot: 'Filtro atualizado', quantidade: 3, valor_unitario: 60 })
  });
  assert.equal(updateResponse.status, 200);
  const updated = await updateResponse.json();
  assert.equal(Number(updated.item.quantidade), 3);

  let [balanceRows] = await getPool().execute('SELECT saldo_atual FROM vw_saldo_estoque WHERE id_peca = ?', [idPeca]);
  assert.equal(Number(balanceRows[0].saldo_atual), 1, 'increasing quantity should consume the difference');
  let orderResponse = await fetch(`${baseUrl}/api/ordens-servico/${idOs}`, { headers: { Cookie: adminCookie } });
  let orderPayload = await orderResponse.json();
  assert.equal(Number(orderPayload.ordem.valor_total), 180);

  const deleteResponse = await fetch(`${baseUrl}/api/ordens-servico/${idOs}/os-pecas/${created.item.id_os_peca}`, {
    method: 'DELETE',
    headers: { Cookie: adminCookie }
  });
  assert.equal(deleteResponse.status, 204);

  [balanceRows] = await getPool().execute('SELECT saldo_atual FROM vw_saldo_estoque WHERE id_peca = ?', [idPeca]);
  assert.equal(Number(balanceRows[0].saldo_atual), 4, 'removal should refund all consumed parts');
  const [movementRows] = await getPool().execute(
    'SELECT quantidade_delta, motivo FROM movimentos_estoque WHERE id_os_peca = ? ORDER BY id_movimento',
    [created.item.id_os_peca]
  );
  assert.deepEqual(movementRows, [
    { quantidade_delta: -2, motivo: 'CONSUMO_OS' },
    { quantidade_delta: -1, motivo: 'CONSUMO_OS' },
    { quantidade_delta: 3, motivo: 'ESTORNO' }
  ]);

  const listResponse = await fetch(`${baseUrl}/api/ordens-servico/${idOs}/os-pecas`, { headers: { Cookie: adminCookie } });
  const list = await listResponse.json();
  assert.equal(list.itens.length, 0);
  orderResponse = await fetch(`${baseUrl}/api/ordens-servico/${idOs}`, { headers: { Cookie: adminCookie } });
  orderPayload = await orderResponse.json();
  assert.equal(Number(orderPayload.ordem.valor_total), 0);

  const [vehicleRows] = await getPool().execute('SELECT id_veiculo FROM ordens_servico WHERE id_os = ?', [idOs]);
  const historyResponse = await fetch(`${baseUrl}/api/veiculos/${vehicleRows[0].id_veiculo}/historico`, {
    headers: { Cookie: adminCookie }
  });
  const history = await historyResponse.json();
  assert.equal(historyResponse.status, 200);
  assert.equal(history.ordens[0].pecas.length, 0, 'removed parts should not appear among current vehicle items');
});

test('list order part items with admin session', async () => {
  const adminCookie = await getAdminCookie();
  const idOs = await createOrder();
  const idPeca = await createPart();
  await addStock(idPeca, 2);

  await fetch(`${baseUrl}/api/ordens-servico/${idOs}/os-pecas`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({
      id_peca: idPeca,
      descricao_snapshot: 'Filtro de combustível',
      quantidade: 1,
      valor_unitario: 50.00
    })
  });

  const response = await fetch(`${baseUrl}/api/ordens-servico/${idOs}/os-pecas`, {
    headers: { Cookie: adminCookie }
  });

  assert.equal(response.status, 200, 'order part item list should return 200');
  const payload = await response.json();
  assert.ok(Array.isArray(payload.itens), 'order part item list should be an array');
  assert.ok(payload.itens.length >= 1, 'order part item list should have at least one item');
});
