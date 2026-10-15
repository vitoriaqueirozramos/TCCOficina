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

async function createPart() {
  const adminCookie = await getAdminCookie();
  const response = await fetch(`${baseUrl}/api/pecas`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({
      codigo: `EST-${randomUUID().slice(0, 8)}`,
      nome: 'Vela de ignição',
      descricao: 'Vela de ignição automotiva',
      preco_atual: 18.9,
      estoque_minimo: 3,
      ativo: true
    })
  });

  const payload = await response.json();
  assert.equal(response.status, 201, 'part creation should succeed for stock test');
  return payload.peca.id_peca;
}

test('create stock movement with admin session', async () => {
  const adminCookie = await getAdminCookie();
  const idPeca = await createPart();

  const response = await fetch(`${baseUrl}/api/estoque/movimentos`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Cookie: adminCookie
    },
    body: JSON.stringify({
      id_peca: idPeca,
      quantidade_delta: 10,
      motivo: 'ENTRADA',
      observacao: 'Entrada inicial de estoque'
    })
  });

  assert.equal(response.status, 201, 'stock movement creation should return 201');
  const payload = await response.json();
  assert.equal(payload.movimento.id_peca, idPeca);
  assert.equal(payload.movimento.quantidade_delta, 10);
});

test('list stock movements with admin session', async () => {
  const adminCookie = await getAdminCookie();
  const idPeca = await createPart();

  await fetch(`${baseUrl}/api/estoque/movimentos`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({
      id_peca: idPeca,
      quantidade_delta: 5,
      motivo: 'ENTRADA',
      observacao: 'Recebimento de complemento'
    })
  });

  const response = await fetch(`${baseUrl}/api/estoque/movimentos?id_peca=${idPeca}`, {
    headers: { Cookie: adminCookie }
  });

  assert.equal(response.status, 200, 'stock movement list should return 200');
  const payload = await response.json();
  assert.ok(Array.isArray(payload.movimentos), 'stock movement list should be an array');
  assert.ok(payload.movimentos.length >= 1, 'stock movement list should have at least one record');
});

test('reject negative stock balances and direct OS movement creation', async () => {
  const adminCookie = await getAdminCookie();
  const idPeca = await createPart();

  const adjustmentResponse = await fetch(`${baseUrl}/api/estoque/movimentos`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({
      id_peca: idPeca,
      quantidade_delta: -1,
      motivo: 'AJUSTE'
    })
  });
  assert.equal(adjustmentResponse.status, 409, 'an adjustment must not produce negative inventory');

  const orderMovementResponse = await fetch(`${baseUrl}/api/estoque/movimentos`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({
      id_peca: idPeca,
      id_os_peca: 1,
      quantidade_delta: -1,
      motivo: 'CONSUMO_OS'
    })
  });
  assert.equal(orderMovementResponse.status, 400, 'OS consumption must use the order workflow');

  const [balanceRows] = await getPool().execute(
    'SELECT saldo_atual FROM vw_saldo_estoque WHERE id_peca = ?',
    [idPeca]
  );
  assert.equal(Number(balanceRows[0].saldo_atual), 0, 'rejected movements should leave inventory unchanged');
});
