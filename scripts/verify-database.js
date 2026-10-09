require('dotenv').config({ quiet: true });

const assert = require('node:assert/strict');
const mysql = require('mysql2/promise');

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  try {
    const checks = [
      {
        label: 'tabelas base',
        expected: 13,
        sql: "SELECT COUNT(*) AS total FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'"
      },
      {
        label: 'views',
        expected: 1,
        sql: 'SELECT COUNT(*) AS total FROM information_schema.views WHERE table_schema = DATABASE()'
      },
      { label: 'perfis iniciais', expected: 3, sql: 'SELECT COUNT(*) AS total FROM perfis' },
      { label: 'status iniciais', expected: 7, sql: 'SELECT COUNT(*) AS total FROM status_os' },
      {
        label: 'chaves estrangeiras',
        expected: 19,
        sql: "SELECT COUNT(*) AS total FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND constraint_type = 'FOREIGN KEY'"
      },
      {
        label: 'restrições CHECK',
        expected: 8,
        sql: 'SELECT COUNT(*) AS total FROM information_schema.check_constraints WHERE constraint_schema = DATABASE()'
      }
    ];

    for (const check of checks) {
      const [[result]] = await connection.query(check.sql);
      assert.equal(Number(result.total), check.expected, `${check.label}: esperado ${check.expected}, recebido ${result.total}`);
      console.log(`OK ${check.label}: ${result.total}`);
    }

    const [[view]] = await connection.query(
      "SELECT COUNT(*) AS total FROM information_schema.views WHERE table_schema = DATABASE() AND table_name = 'vw_saldo_estoque'"
    );
    assert.equal(Number(view.total), 1, 'vw_saldo_estoque deve existir');
    console.log('OK vw_saldo_estoque existe');
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(`Verificação do banco falhou: ${error.code || error.name}`);
  process.exitCode = 1;
});
