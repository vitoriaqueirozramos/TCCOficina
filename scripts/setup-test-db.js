// Recria o banco de TESTES do zero a partir de database/schema.sql.
// Só aceita nomes terminados em _test: o banco principal nunca é tocado por este script.

require('dotenv').config({ quiet: true });

const fs = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');

function testDatabaseName() {
  const name = process.env.TEST_DB_NAME || `${process.env.DB_NAME || 'oficinatech'}_test`;
  if (!/^[A-Za-z0-9_]+_test$/.test(name)) {
    throw new Error(`Nome de banco de testes inválido: "${name}". Ele deve terminar em _test.`);
  }
  if (name === process.env.DB_NAME && process.env.NODE_ENV !== 'test') {
    throw new Error('DB_NAME aponta para um banco _test fora do modo de teste; revise o .env.');
  }
  return name;
}

async function setupTestDatabase() {
  const name = testDatabaseName();
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    multipleStatements: true
  });

  try {
    const schema = fs.readFileSync(path.join(__dirname, '..', 'database', 'schema.sql'), 'utf8')
      .replace(/CREATE DATABASE IF NOT EXISTS[\s\S]*?;/, '')
      .replace(/USE\s+\w+;/, '');

    // Limpeza controlada: cada execução começa com o banco de testes vazio.
    await connection.query(`DROP DATABASE IF EXISTS \`${name}\``);
    await connection.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
    await connection.query(`USE \`${name}\``);
    await connection.query(schema);

    // Contas mínimas para a suíte; as senhas não são usadas (os testes assinam o próprio token).
    await connection.query(
      `INSERT INTO usuarios (id_perfil, nome, email, senha_hash, ativo)
       SELECT id_perfil, 'Administrador de Teste', 'admin@oficinatech.test', '!sem-senha', TRUE FROM perfis WHERE nome = 'ADMINISTRADOR';
       INSERT INTO usuarios (id_perfil, nome, email, senha_hash, ativo)
       SELECT id_perfil, 'Atendente de Teste', 'atendente@oficinatech.test', '!sem-senha', TRUE FROM perfis WHERE nome = 'ATENDENTE';`
    );
    return name;
  } finally {
    await connection.end();
  }
}

if (require.main === module) {
  setupTestDatabase()
    .then((name) => console.log(`Banco de testes ${name} recriado.`))
    .catch((error) => {
      console.error(`Não foi possível preparar o banco de testes: ${error.message}`);
      process.exitCode = 1;
    });
}

module.exports = { setupTestDatabase, testDatabaseName };
