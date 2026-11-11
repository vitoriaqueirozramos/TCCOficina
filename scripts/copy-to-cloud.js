// Copia o banco local (definido no .env) para um banco MySQL em nuvem (definido no .env.tidb).
// O banco local é apenas lido. O destino precisa estar vazio: o script se recusa a sobrescrever.
// Uso: node scripts/copy-to-cloud.js            (somente testa a conexão e mostra o plano)
//      node scripts/copy-to-cloud.js --apply    (cria as tabelas e copia os dados)
const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');
const mysql = require('mysql2/promise');

const TABLES = [
  'perfis', 'usuarios', 'clientes', 'veiculos', 'mecanicos', 'servicos', 'pecas', 'status_os',
  'ordens_servico', 'os_servicos', 'os_pecas', 'movimentos_estoque', 'historico_status_os'
];
const VIEW = 'vw_saldo_estoque';
const root = path.join(__dirname, '..');

function readEnv(file) {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) throw new Error(`Arquivo ${file} não encontrado.`);
  return dotenv.parse(fs.readFileSync(full));
}

function connect(env, ssl) {
  return mysql.createConnection({
    host: env.DB_HOST, port: Number(env.DB_PORT || 3306), user: env.DB_USER,
    password: env.DB_PASSWORD || '', database: env.DB_NAME, dateStrings: true,
    ...(ssl ? { ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: true } } : {})
  });
}

(async () => {
  const apply = process.argv.includes('--apply');
  const localEnv = readEnv('.env');
  const cloudEnv = readEnv('.env.tidb');
  const local = await connect(localEnv, false);
  const cloud = await connect(cloudEnv, !/^(0|false)$/i.test(cloudEnv.DB_SSL || 'true'));

  const [[version]] = await cloud.query('SELECT VERSION() AS v');
  console.log(`Conectado ao destino: ${version.v} (banco ${cloudEnv.DB_NAME})`);

  const [existing] = await cloud.query('SHOW FULL TABLES');
  if (existing.length) {
    throw new Error(`O banco de destino já tem ${existing.length} tabela(s)/view(s). Use um banco vazio; nada foi alterado.`);
  }

  const counts = {};
  for (const table of TABLES) {
    const [[row]] = await local.query(`SELECT COUNT(*) AS n FROM \`${table}\``);
    counts[table] = row.n;
  }
  console.table(counts);
  if (!apply) {
    console.log('Simulação: nada foi criado. Rode novamente com --apply para copiar.');
    return;
  }

  // A aplicação já valida estas regras; se o destino permitir, as restrições CHECK também valem no banco.
  try { await cloud.query('SET GLOBAL tidb_enable_check_constraint = ON'); } catch { console.log('Aviso: restrições CHECK não puderam ser ativadas no destino.'); }
  await cloud.query('SET FOREIGN_KEY_CHECKS = 0');

  for (const table of TABLES) {
    const [[ddl]] = await local.query(`SHOW CREATE TABLE \`${table}\``);
    await cloud.query(ddl['Create Table']);
    const [rows] = await local.query(`SELECT * FROM \`${table}\``);
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200);
      const columns = Object.keys(chunk[0]);
      await cloud.query(
        `INSERT INTO \`${table}\` (${columns.map((c) => `\`${c}\``).join(', ')}) VALUES ?`,
        [chunk.map((row) => columns.map((c) => row[c]))]
      );
    }
    const [[check]] = await cloud.query(`SELECT COUNT(*) AS n FROM \`${table}\``);
    if (check.n !== counts[table]) throw new Error(`${table}: esperado ${counts[table]}, copiado ${check.n}.`);
    console.log(`OK ${table}: ${check.n}`);
  }

  const [[viewDdl]] = await local.query(`SHOW CREATE VIEW \`${VIEW}\``);
  await cloud.query(viewDdl['Create View'].replace(/ DEFINER=`[^`]*`@`[^`]*`/, '').replace(/^CREATE ALGORITHM=\w+ /, 'CREATE '));
  await cloud.query('SET FOREIGN_KEY_CHECKS = 1');
  const [[saldo]] = await cloud.query(`SELECT COUNT(*) AS n FROM \`${VIEW}\``);
  console.log(`OK ${VIEW}: ${saldo.n} peças`);
  console.log('Cópia concluída.');
})()
  .then(() => process.exit(0))
  .catch((error) => { console.error('FALHA:', error.message); process.exit(1); });
