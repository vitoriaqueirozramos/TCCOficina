require('dotenv').config();

const { closePool, getPool } = require('../src/config/database');

async function migrate() {
  const pool = getPool();
  for (const table of ['os_servicos', 'os_pecas']) {
    const [columns] = await pool.execute(
      `SELECT COLUMN_NAME
       FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
      [table, 'removida_em']
    );
    if (columns.length === 0) {
      await pool.query(`ALTER TABLE ${table} ADD COLUMN removida_em DATETIME NULL`);
      console.log(`Added removida_em to ${table}.`);
    } else {
      console.log(`Column removida_em already exists on ${table}.`);
    }
  }
}

migrate()
  .catch((error) => {
    console.error('Could not migrate OS item removal columns.');
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(closePool);
