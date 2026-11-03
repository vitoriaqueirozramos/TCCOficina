require('dotenv').config({ quiet: true });

const { closePool, getPool } = require('../src/config/database');

const displayNames = [
  'Rafael Almeida',
  'Bruno Carvalho',
  'Marcos Vieira',
  'Diego Ferreira',
  'João Pedro Santos',
  'André Costa',
  'Lucas Ribeiro',
  'Paulo Henrique Lima',
  'Fernando Souza',
  'Gustavo Martins',
  'Eduardo Rocha',
  'Tiago Barros',
  'Vinícius Oliveira',
  'Daniel Azevedo',
  'Gabriel Nunes',
  'Rodrigo Alves',
  'Felipe Teixeira',
  'Henrique Moreira',
  'Leandro Campos',
  'Caio Mendes'
];

async function renamePlaceholderMechanics() {
  const pool = getPool();
  let renamed = 0;
  for (const placeholder of ['Mecânico OS', 'Mecânico Teste']) {
    const [rows] = await pool.execute(
      `SELECT u.id_usuario
       FROM usuarios AS u
       JOIN mecanicos AS m ON m.id_usuario = u.id_usuario
       WHERE u.nome = ?
       ORDER BY u.id_usuario`,
      [placeholder]
    );
    for (let index = 0; index < rows.length; index += 1) {
      const displayName = displayNames[(rows[index].id_usuario - 1) % displayNames.length];
      const uniqueName = index < displayNames.length ? displayName : `${displayName} ${index + 1}`;
      await pool.execute('UPDATE usuarios SET nome = ? WHERE id_usuario = ?', [uniqueName, rows[index].id_usuario]);
      renamed += 1;
    }
  }
  console.log(`Renamed ${renamed} local placeholder mechanic accounts.`);
}

renamePlaceholderMechanics()
  .catch((error) => {
    console.error(`Could not rename local placeholder mechanics: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(closePool);
