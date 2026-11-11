// Executa a suíte de integração em um banco SEPARADO (DB_NAME + "_test"), recriado a cada execução.
// O banco principal nunca é usado: a API de teste sobe com NODE_ENV=test, que só aceita bancos _test.

require('dotenv').config({ quiet: true });

const { spawn } = require('node:child_process');
const path = require('node:path');
const { setupTestDatabase } = require('./setup-test-db');

const projectRoot = path.resolve(__dirname, '..');
const nodePath = process.execPath;

let server;
let testProcess;
let finishing = false;
let startupTimeout;

function finish(exitCode) {
  if (finishing) return;
  finishing = true;
  clearTimeout(startupTimeout);
  if (testProcess && testProcess.exitCode === null) testProcess.kill();
  if (server && server.exitCode === null) server.kill();
  process.exitCode = exitCode;
}

async function confirmTestEnvironment(port) {
  const response = await fetch(`http://127.0.0.1:${port}/api/health/database`);
  const payload = await response.json();
  if (!response.ok || payload.ambiente !== 'test') {
    throw new Error('A API iniciada não confirmou o ambiente de teste; a suíte não será executada.');
  }
}

function runTests(environment, port) {
  testProcess = spawn(nodePath, [
    '--test',
    '--test-force-exit',
    '--test-concurrency=1',
    '--test-reporter=spec',
    '--import=./scripts/fetch-drain-preload.cjs',
    ...process.argv.slice(2)
  ], {
    cwd: projectRoot,
    env: { ...environment, TEST_BASE_URL: `http://127.0.0.1:${port}` },
    stdio: 'inherit'
  });
  testProcess.on('error', () => finish(1));
  testProcess.on('exit', (code, signal) => finish(signal ? 1 : (code ?? 1)));
}

async function main() {
  const testDatabase = await setupTestDatabase();
  console.info(`Banco de testes: ${testDatabase} (recriado para esta execução)`);
  const environment = { ...process.env, NODE_ENV: 'test', DB_NAME: testDatabase, PORT: '0' };

  server = spawn(nodePath, ['src/server.js'], {
    cwd: projectRoot,
    env: environment,
    stdio: ['ignore', 'pipe', 'inherit']
  });

  let serverOutput = '';
  let serverReady = false;
  startupTimeout = setTimeout(() => {
    console.error('A API não iniciou a tempo.');
    finish(1);
  }, 15000);

  server.stdout.on('data', (chunk) => {
    process.stdout.write(chunk);
    serverOutput += chunk.toString();
    const listenMessage = serverOutput.match(/listening on port (\d+)/);
    if (!serverReady && listenMessage) {
      serverReady = true;
      clearTimeout(startupTimeout);
      const port = Number(listenMessage[1]);
      confirmTestEnvironment(port)
        .then(() => runTests(environment, port))
        .catch((error) => {
          console.error(error.message);
          finish(1);
        });
    }
  });

  server.on('error', () => finish(1));
  server.on('exit', (code) => {
    if (!finishing) {
      console.error(`A API encerrou ${serverReady ? 'durante os testes' : 'antes dos testes'} (código ${code ?? 'desconhecido'}).`);
      finish(code ?? 1);
    }
  });
}

process.on('SIGINT', () => finish(130));
process.on('SIGTERM', () => finish(143));

main().catch((error) => {
  console.error(`Não foi possível iniciar os testes: ${error.message}`);
  finish(1);
});
