const { spawn } = require('node:child_process');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const nodePath = process.execPath;
const childEnvironment = { ...process.env, PORT: '3000' };
const server = spawn(nodePath, ['src/server.js'], {
  cwd: projectRoot,
  env: childEnvironment,
  stdio: ['ignore', 'pipe', 'inherit']
});

let serverOutput = '';
let serverReady = false;
let testProcess;
let finishing = false;

const startupTimeout = setTimeout(() => {
  console.error('API did not start on port 3000 in time.');
  finish(1);
}, 15000);

function finish(exitCode) {
  if (finishing) return;
  finishing = true;
  clearTimeout(startupTimeout);
  if (testProcess && testProcess.exitCode === null) testProcess.kill();
  if (server.exitCode === null) server.kill();
  process.exitCode = exitCode;
}

function runTests() {
  testProcess = spawn(nodePath, [
    '--test',
    '--test-force-exit',
    '--test-concurrency=1',
      '--test-reporter=spec',
    '--import=./scripts/fetch-drain-preload.cjs',
      ...process.argv.slice(2)
  ], {
    cwd: projectRoot,
    env: childEnvironment,
    stdio: 'inherit'
  });
  testProcess.on('error', () => finish(1));
  testProcess.on('exit', (code, signal) => finish(signal ? 1 : (code ?? 1)));
}

server.stdout.on('data', (chunk) => {
  process.stdout.write(chunk);
  serverOutput += chunk.toString();
  if (!serverReady && serverOutput.includes('listening on port 3000')) {
    serverReady = true;
    clearTimeout(startupTimeout);
    runTests();
  }
});

server.on('error', () => finish(1));
server.on('exit', (code) => {
  if (!serverReady && !finishing) {
    console.error(`API exited before tests started (code ${code ?? 'unknown'}).`);
    finish(code ?? 1);
  } else if (serverReady && !finishing) {
    console.error(`API exited during tests (code ${code ?? 'unknown'}).`);
    finish(code ?? 1);
  }
});

process.on('SIGINT', () => finish(130));
process.on('SIGTERM', () => finish(143));
