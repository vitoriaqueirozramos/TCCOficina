require('dotenv').config({ quiet: true });

const assert = require('node:assert/strict');
const mysql = require('mysql2/promise');

async function expectConstraint(label, expectedCode, operation) {
  try {
    await operation();
  } catch (error) {
    assert.equal(error.code, expectedCode, `${label}: código inesperado ${error.code}`);
    console.log(`OK ${label}: ${error.code}`);
    return;
  }

  assert.fail(`${label}: a operação deveria ter sido rejeitada`);
}

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  try {
    await connection.beginTransaction();

    const [[profile]] = await connection.query(
      "SELECT id_perfil FROM perfis WHERE nome = 'ADMINISTRADOR'"
    );
    assert.ok(profile, 'perfil ADMINISTRADOR não encontrado');

    await expectConstraint('UNIQUE de perfil', 'ER_DUP_ENTRY', () =>
      connection.query("INSERT INTO perfis (nome) VALUES ('ADMINISTRADOR')")
    );

    await expectConstraint('CHECK de preço de serviço', 'ER_CHECK_CONSTRAINT_VIOLATED', () =>
      connection.query("INSERT INTO servicos (nome, preco_atual) VALUES ('Teste inválido', -1.00)")
    );

    await expectConstraint('FK de mecânico', 'ER_NO_REFERENCED_ROW_2', () =>
      connection.query('INSERT INTO mecanicos (id_usuario) VALUES (4294967295)')
    );

    const suffix = `${process.pid}-${Date.now()}`;
    const [user] = await connection.query(
      'INSERT INTO usuarios (id_perfil, nome, email, senha_hash) VALUES (?, ?, ?, ?)',
      [profile.id_perfil, 'Usuário de teste transacional', `db-check-${suffix}@example.invalid`, 'hash-de-teste-rollback']
    );
    const [part] = await connection.query(
      'INSERT INTO pecas (codigo, nome) VALUES (?, ?)',
      [`DB-CHECK-${suffix}`, 'Peça de teste transacional']
    );

    await expectConstraint('CHECK de quantidade de movimento', 'ER_CHECK_CONSTRAINT_VIOLATED', () =>
      connection.query(
        'INSERT INTO movimentos_estoque (id_peca, registrado_por, quantidade_delta, motivo) VALUES (?, ?, 0, ?)',
        [part.insertId, user.insertId, 'AJUSTE']
      )
    );
  } finally {
    await connection.rollback();
    await connection.end();
    console.log('Rollback concluído; registros de teste não foram persistidos.');
  }
}

main().catch((error) => {
  console.error(`Teste de restrições falhou: ${error.code || error.name}`);
  process.exitCode = 1;
});
