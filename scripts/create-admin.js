require('dotenv').config({ quiet: true });

const readline = require('node:readline');
const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');

const [name, rawEmail] = process.argv.slice(2);
const email = rawEmail?.trim().toLowerCase();

function promptHidden(label) {
  const input = process.stdin;
  const output = process.stdout;
  if (!input.isTTY || typeof input.setRawMode !== 'function') {
    throw new Error('Execute este comando em um terminal interativo.');
  }

  readline.emitKeypressEvents(input);
  input.setRawMode(true);
  input.resume();
  output.write(label);

  return new Promise((resolve, reject) => {
    let value = '';
    const onKeypress = (character, key) => {
      if (key.ctrl && key.name === 'c') {
        input.setRawMode(false);
        input.pause();
        input.removeListener('keypress', onKeypress);
        output.write('\n');
        reject(new Error('Operação cancelada.'));
        return;
      }

      if (key.name === 'return' || key.name === 'enter') {
        input.setRawMode(false);
        input.pause();
        input.removeListener('keypress', onKeypress);
        output.write('\n');
        resolve(value);
        return;
      }

      if (key.name === 'backspace') {
        value = value.slice(0, -1);
        return;
      }

      if (character && !key.ctrl && !key.meta) {
        value += character;
      }
    };

    input.on('keypress', onKeypress);
  });
}

async function main() {
  if (!name || !email || email.length > 254) {
    throw new Error('Uso: npm run admin:create -- "Nome" "email@oficina.com"');
  }

  const password = await promptHidden('Nova senha (mínimo 12 caracteres): ');
  const confirmation = await promptHidden('Confirme a senha: ');
  if (password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) {
    throw new Error('A senha deve ter de 12 a 72 bytes.');
  }
  if (password !== confirmation) {
    throw new Error('As senhas não conferem.');
  }

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  try {
    const [[existingAdmin]] = await connection.query(
      `SELECT COUNT(*) AS total
       FROM usuarios AS u
       JOIN perfis AS p ON p.id_perfil = u.id_perfil
       WHERE p.nome = 'ADMINISTRADOR' AND u.ativo = TRUE`
    );
    if (Number(existingAdmin.total) > 0) {
      throw new Error('Já existe um administrador ativo. Use o fluxo de cadastro de usuários após o login.');
    }

    const [[profile]] = await connection.query(
      "SELECT id_perfil FROM perfis WHERE nome = 'ADMINISTRADOR'"
    );
    if (!profile) {
      throw new Error('Perfil ADMINISTRADOR não encontrado. Execute database/schema.sql primeiro.');
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await connection.execute(
      'INSERT INTO usuarios (id_perfil, nome, email, senha_hash) VALUES (?, ?, ?, ?)',
      [profile.id_perfil, name.trim(), email, passwordHash]
    );
    console.log('Administrador criado. A senha não foi exibida nem armazenada em texto puro.');
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(`Não foi possível criar o administrador: ${error.code || error.message}`);
  process.exitCode = 1;
});
