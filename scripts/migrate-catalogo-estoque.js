require('dotenv').config({ quiet: true });

const { closePool, getPool } = require('../src/config/database');

const MOVEMENT_CHECK = `(
    (motivo = 'ENTRADA' AND quantidade_delta > 0 AND id_os_peca IS NULL)
    OR (motivo = 'SAIDA' AND quantidade_delta < 0 AND id_os_peca IS NULL)
    OR (motivo = 'CONSUMO_OS' AND quantidade_delta < 0 AND id_os_peca IS NOT NULL)
    OR (motivo = 'AJUSTE' AND quantidade_delta <> 0)
    OR (motivo = 'ESTORNO' AND id_os_peca IS NOT NULL AND quantidade_delta <> 0)
  )`;

const STOCK_VIEW = `CREATE OR REPLACE SQL SECURITY INVOKER VIEW vw_saldo_estoque AS
SELECT
  p.id_peca,
  p.codigo,
  p.nome,
  p.estoque_minimo,
  p.ativo,
  COALESCE(SUM(m.quantidade_delta), 0) AS saldo_atual,
  p.categoria,
  p.unidade,
  p.preco_custo,
  p.preco_atual,
  CASE
    WHEN COALESCE(SUM(m.quantidade_delta), 0) <= 0 THEN 'SEM_ESTOQUE'
    WHEN COALESCE(SUM(m.quantidade_delta), 0) < p.estoque_minimo THEN 'BAIXO'
    ELSE 'DISPONIVEL'
  END AS situacao
FROM pecas AS p
LEFT JOIN movimentos_estoque AS m ON m.id_peca = p.id_peca
GROUP BY p.id_peca, p.codigo, p.nome, p.estoque_minimo, p.ativo,
         p.categoria, p.unidade, p.preco_custo, p.preco_atual`;

async function columnExists(pool, table, column) {
  const [rows] = await pool.execute(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
    [table, column]
  );
  return rows.length > 0;
}

async function checkClause(pool, name) {
  const [rows] = await pool.execute(
    `SELECT check_clause FROM information_schema.check_constraints
     WHERE constraint_schema = DATABASE() AND constraint_name = ?`,
    [name]
  );
  return rows[0]?.CHECK_CLAUSE ?? rows[0]?.check_clause ?? null;
}

async function addColumn(pool, table, column, definition) {
  if (await columnExists(pool, table, column)) {
    console.log(`Coluna ${table}.${column} já existe.`);
    return;
  }
  await pool.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  console.log(`Coluna ${table}.${column} adicionada.`);
}

async function migrate() {
  const pool = getPool();

  await addColumn(pool, 'pecas', 'categoria', "VARCHAR(40) NOT NULL DEFAULT 'Geral' AFTER descricao");
  await addColumn(pool, 'pecas', 'unidade', "VARCHAR(10) NOT NULL DEFAULT 'UN' AFTER categoria");
  await addColumn(pool, 'pecas', 'preco_custo', 'DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER unidade');
  if (await checkClause(pool, 'chk_pecas_custo') === null) {
    await pool.query('ALTER TABLE pecas ADD CONSTRAINT chk_pecas_custo CHECK (preco_custo >= 0)');
    console.log('CHECK chk_pecas_custo adicionado.');
  } else {
    console.log('CHECK chk_pecas_custo já existe.');
  }

  await addColumn(pool, 'servicos', 'duracao_minutos', 'SMALLINT UNSIGNED NULL AFTER preco_atual');
  await addColumn(pool, 'movimentos_estoque', 'justificativa', 'VARCHAR(60) NULL AFTER motivo');

  const movementCheck = await checkClause(pool, 'chk_movimentos_motivo');
  if (movementCheck === null) {
    await pool.query(`ALTER TABLE movimentos_estoque ADD CONSTRAINT chk_movimentos_motivo CHECK ${MOVEMENT_CHECK}`);
    console.log('CHECK chk_movimentos_motivo criado.');
  } else if (!movementCheck.includes('SAIDA')) {
    await pool.query('ALTER TABLE movimentos_estoque DROP CHECK chk_movimentos_motivo');
    await pool.query(`ALTER TABLE movimentos_estoque ADD CONSTRAINT chk_movimentos_motivo CHECK ${MOVEMENT_CHECK}`);
    console.log('CHECK chk_movimentos_motivo atualizado para aceitar SAIDA.');
  } else {
    console.log('CHECK chk_movimentos_motivo já aceita SAIDA.');
  }

  await pool.query(STOCK_VIEW);
  console.log('View vw_saldo_estoque atualizada.');
}

if (require.main === module) {
  migrate()
    .catch((error) => {
      console.error('Não foi possível aplicar a migração de catálogo e estoque.');
      console.error(error.message);
      process.exitCode = 1;
    })
    .finally(closePool);
}

module.exports = { migrate };
