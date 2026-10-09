const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const app = require('../src/app');
const { requireRoles } = require('../src/middleware/auth.middleware');

let server;
let baseUrl;

before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
});

test('health endpoint responds without requiring a database', async () => {
  const response = await fetch(`${baseUrl}/api/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok' });
});

test('root serves the dashboard HTML', async () => {
  const response = await fetch(`${baseUrl}/`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/html/);
  assert.match(await response.text(), /OFICINATECH/);
});

test('unknown routes return JSON 404', async () => {
  const response = await fetch(`${baseUrl}/api/rota-inexistente`);
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: 'Rota não encontrada.' });
});

test('protected account endpoint rejects anonymous requests', async () => {
  const response = await fetch(`${baseUrl}/api/auth/me`);
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: 'Autenticação necessária.' });
});

test('login validates required fields before database access', async () => {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: '', password: '' })
  });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'Informe um e-mail e uma senha válidos.' });
});

test('logout clears the authentication cookie', async () => {
  const response = await fetch(`${baseUrl}/api/auth/logout`, { method: 'POST' });
  assert.equal(response.status, 204);
  assert.match(response.headers.get('set-cookie'), /HttpOnly/i);
  assert.match(response.headers.get('set-cookie'), /Expires=Thu, 01 Jan 1970/i);
});

test('login page is served as static HTML', async () => {
  const response = await fetch(`${baseUrl}/login.html`);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Entrar na oficina/);
});

test('role middleware denies users without the required profile', () => {
  const response = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
  let nextCalled = false;

  requireRoles('ADMINISTRADOR')(
    { user: { perfil: 'ATENDENTE' } },
    response,
    () => { nextCalled = true; }
  );

  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.body, { error: 'Acesso não autorizado.' });
  assert.equal(nextCalled, false);
});

test('role middleware allows a user with the required profile', () => {
  let nextCalled = false;
  requireRoles('ADMINISTRADOR')(
    { user: { perfil: 'ADMINISTRADOR' } },
    {},
    () => { nextCalled = true; }
  );
  assert.equal(nextCalled, true);
});
