const mysql = require('mysql2/promise');

let pool;

function getPool() {
  if (pool) {
    return pool;
  }

  const { DB_HOST, DB_NAME, DB_PASSWORD, DB_PORT, DB_USER } = process.env;
  if (!DB_USER || !DB_NAME) {
    throw new Error('DB_USER and DB_NAME must be configured.');
  }

  const port = Number(DB_PORT || 3306);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('DB_PORT must be a valid TCP port.');
  }

  pool = mysql.createPool({
    host: DB_HOST || '127.0.0.1',
    port,
    user: DB_USER,
    password: DB_PASSWORD || '',
    database: DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
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
