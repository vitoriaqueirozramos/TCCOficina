// Apoio compartilhado dos testes de integração (carrega a trava do ambiente isolado).
require('../scripts/test-ambiente');

const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const jwt = require('jsonwebtoken');
const { getPool } = require('../src/config/database');
const { getJwtSecret } = require('../src/config/auth');

const baseUrl = process.env.TEST_BASE_URL;
const uid = (size = 8) => randomUUID().replace(/-/g, '').slice(0, size).toUpperCase();
const cookieFor = (idUsuario) => `oficinatech_token=${jwt.sign({ sub: String(idUsuario) }, getJwtSecret(), { expiresIn: '15m', issuer: 'oficinatech' })}`;

async function adminCookie() {
  const [rows] = await getPool().execute(
    `SELECT u.id_usuario FROM usuarios AS u JOIN perfis AS p ON p.id_perfil = u.id_perfil
     WHERE p.nome = 'ADMINISTRADOR' AND u.ativo = TRUE ORDER BY u.id_usuario LIMIT 1`
  );
  assert.ok(rows.length > 0, 'o banco de testes deve ter um administrador');
  return cookieFor(rows[0].id_usuario);
}

async function request(method, url, body, cookie) {
  const response = await fetch(`${baseUrl}${url}`, {
    method,
    headers: { 'content-type': 'application/json', Cookie: cookie ?? await adminCookie() },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const payload = response.status === 204 ? null : await response.json().catch(() => null);
  return { status: response.status, body: payload };
}

async function createUser(perfil, nome = 'Usuário de Teste') {
  const [profiles] = await getPool().execute('SELECT id_perfil FROM perfis WHERE nome = ? LIMIT 1', [perfil]);
  const [result] = await getPool().execute(
    'INSERT INTO usuarios (id_perfil, nome, email, senha_hash, ativo) VALUES (?, ?, ?, ?, TRUE)',
    [profiles[0].id_perfil, nome, `teste.${uid(10).toLowerCase()}@example.com`, '!sem-senha']
  );
  return result.insertId;
}

async function createMechanic({ perfil = 'MECANICO', nome = 'Mecânico de Teste', ativo = true } = {}) {
  const idUsuario = await createUser(perfil, nome);
  const response = await request('POST', '/api/mecanicos', { id_usuario: idUsuario, especialidade: 'Mecânica geral', ativo });
  assert.equal(response.status, 201, 'cadastro de mecânico');
  return response.body.mecanico;
}

async function createClient() {
  const response = await request('POST', '/api/clientes', { nome: `Cliente ${uid(6)}`, documento: `DOC-${uid(10)}`, telefone: '(41) 99999-0000' });
  assert.equal(response.status, 201, 'cadastro de cliente');
  return response.body.cliente;
}

async function createVehicle(idCliente) {
  const response = await request('POST', '/api/veiculos', { id_cliente: idCliente, placa: `T${uid(6)}`, marca: 'Fiat', modelo: 'Uno', ano: 2020 });
  assert.equal(response.status, 201, 'cadastro de veículo');
  return response.body.veiculo;
}

async function createPart(extra = {}) {
  const response = await request('POST', '/api/pecas', {
    codigo: `T-${uid(8)}`, nome: `Peça ${uid(5)}`, categoria: 'Testes', unidade: 'UN', preco_custo: 10, preco_atual: 20, estoque_minimo: 2, ...extra
  });
  assert.equal(response.status, 201, 'cadastro de peça');
  return response.body.peca;
}

async function createService(extra = {}) {
  const response = await request('POST', '/api/servicos', { nome: `Serviço ${uid(5)}`, preco_atual: 100, duracao_minutos: 60, ...extra });
  assert.equal(response.status, 201, 'cadastro de serviço');
  return response.body.servico;
}

async function createOrder({ idMecanico = null } = {}) {
  const cliente = await createClient();
  const veiculo = await createVehicle(cliente.id_cliente);
  const response = await request('POST', '/api/ordens-servico', {
    id_cliente: cliente.id_cliente, id_veiculo: veiculo.id_veiculo, id_mecanico: idMecanico, diagnostico: 'Teste automatizado'
  });
  assert.equal(response.status, 201, 'abertura de OS');
  return { ordem: response.body.ordem, cliente, veiculo };
}

async function stockBalance(idPeca) {
  const [rows] = await getPool().execute('SELECT saldo_atual FROM vw_saldo_estoque WHERE id_peca = ?', [idPeca]);
  return Number(rows[0].saldo_atual);
}

module.exports = {
  adminCookie, cookieFor, createClient, createMechanic, createOrder, createPart, createService, createUser, createVehicle,
  getPool, request, stockBalance, uid
};
