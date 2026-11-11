// Carregado no início de cada arquivo de teste. Impede que a suíte rode fora do ambiente isolado:
// `npm test` define NODE_ENV=test e aponta DB_NAME para o banco terminado em _test.
require('dotenv').config({ quiet: true });

if (process.env.NODE_ENV !== 'test' || !/_test$/.test(process.env.DB_NAME || '') || !process.env.TEST_BASE_URL) {
  throw new Error('Execute os testes com `npm test`: eles gravam dados e só podem usar o banco de testes (..._test).');
}
