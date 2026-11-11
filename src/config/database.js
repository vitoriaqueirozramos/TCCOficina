const mysql = require('mysql2/promise');

let pool;

function getPool() {
  if (pool) {
    return pool;
  }

  const { DB_HOST, DB_NAME, DB_PASSWORD, DB_POOL_LIMIT, DB_PORT, DB_SSL, DB_USER } = process.env;
  if (!DB_USER || !DB_NAME) {
    throw new Error('DB_USER and DB_NAME must be configured.');
  }

  // Trava de segurança: em modo de teste a aplicação só aceita um banco terminado em _test.
  if (process.env.NODE_ENV === 'test' && !/_test$/.test(DB_NAME)) {
    throw new Error('NODE_ENV=test exige um banco de testes (DB_NAME terminado em _test).');
  }

  const port = Number(DB_PORT || 3306);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('DB_PORT must be a valid TCP port.');
  }

  // Em ambiente serverless cada instância abre o próprio pool: mantenha o limite baixo (DB_POOL_LIMIT).
  const configuredLimit = Number(DB_POOL_LIMIT);
  const poolLimit = Number.isInteger(configuredLimit) && configuredLimit >= 1 && configuredLimit <= 50
    ? configuredLimit
    : (process.env.VERCEL ? 3 : 10);

  pool = mysql.createPool({
    host: DB_HOST || '127.0.0.1',
    port,
    user: DB_USER,
    password: DB_PASSWORD || '',
    database: DB_NAME,
    waitForConnections: true,
    connectionLimit: poolLimit,
    queueLimit: 0,
    connectTimeout: 20000,
    // Horários gravados e lidos no fuso de Brasília, em qualquer servidor (MySQL local ou nuvem em UTC).
    timezone: '-03:00',
    // Bancos em nuvem (TiDB Cloud, por exemplo) exigem conexão TLS: defina DB_SSL=true.
    ...(/^(1|true)$/i.test(DB_SSL || '') ? { ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: true } } : {})
  });

  // NOW() e CURRENT_TIMESTAMP seguem o fuso da sessão: fixa Brasília também em servidores que operam em UTC.
  pool.pool.on('connection', (connection) => {
    connection.query("SET time_zone = '-03:00'");
  });

  return pool;
}

async function closePool() {
  if (pool) {
    const activePool = pool;
    pool = undefined;
    await activePool.end();
  }
}

module.exports = { closePool, getPool };
