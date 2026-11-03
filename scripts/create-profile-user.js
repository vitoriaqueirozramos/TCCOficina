require('dotenv').config({ quiet: true });

const readline = require('node:readline');
const bcrypt = require('bcryptjs');
const { closePool, getPool } = require('../src/config/database');

const [rawProfile, rawName, rawEmail, rawSpecialty] = process.argv.slice(2);
const profile = rawProfile?.trim().toUpperCase();
const name = rawName?.trim();
const email = rawEmail?.trim().toLowerCase();
const specialty = rawSpecialty?.trim();

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
      if (character && !key.ctrl && !key.meta) value += character;
    };
    input.on('keypress', onKeypress);
  });
}

async function createProfileUser() {
  if (!['ATENDENTE', 'MECANICO'].includes(profile) || !name || name.length > 120 || !email || email.length > 254 || !/^\S+@\S+\.\S+$/.test(email)) {
    throw new Error('Uso: npm run usuario:create -- ATENDENTE "Nome" "email@oficina.com" | MECANICO "Nome" "email@oficina.com" "Especialidade"');
  }
  if (profile === 'MECANICO' && (!specialty || specialty.length > 100)) {
    throw new Error('Informe uma especialidade de até 100 caracteres para o mecânico.');
  }
  if (profile === 'ATENDENTE' && specialty) {
    throw new Error('Especialidade só se aplica ao perfil MECANICO.');
  }

  const password = await promptHidden('Nova senha (mínimo 12 caracteres): ');
  const confirmation = await promptHidden('Confirme a senha: ');
  if (password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) {
    throw new Error('A senha deve ter de 12 a 72 bytes.');
  }
  if (password !== confirmation) throw new Error('As senhas não conferem.');

  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const [profileRows] = await connection.execute(
      'SELECT id_perfil FROM perfis WHERE nome = ? LIMIT 1',
      [profile]
    );
    if (profileRows.length === 0) throw new Error(`Perfil ${profile} não encontrado. Execute database/schema.sql primeiro.`);

    const passwordHash = await bcrypt.hash(password, 12);
    const [userResult] = await connection.execute(
      'INSERT INTO usuarios (id_perfil, nome, email, senha_hash, ativo) VALUES (?, ?, ?, ?, TRUE)',
      [profileRows[0].id_perfil, name, email, passwordHash]
    );
    if (profile === 'MECANICO') {
      await connection.execute(
        'INSERT INTO mecanicos (id_usuario, especialidade, ativo) VALUES (?, ?, TRUE)',
        [userResult.insertId, specialty]
      );
    }
    await connection.commit();
    console.log(`Conta ${profile} criada com sucesso. A senha não foi exibida nem armazenada em texto puro.`);
  } catch (error) {
    await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY') {
      throw new Error('Já existe uma conta com este e-mail.');
    }
    throw error;
  } finally {
    connection.release();
  }
}

createProfileUser()
  .catch((error) => {
    console.error(`Não foi possível criar a conta: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(closePool);
