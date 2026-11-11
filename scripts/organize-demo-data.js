// Organização da base de demonstração do OFICINATECH (Etapa 04).
//
// O banco original acumulou registros gravados pelos testes de integração. Este script reduz a base
// às quantidades combinadas (15 clientes, 5 mecânicos, 20 peças, 20 serviços, 30 OS abertas),
// preservando os registros cadastrados manualmente e os históricos das ordens mantidas.
//
// Segurança:
//   - exige o banco de arquivo `oficinatech_original` (cópia completa feita antes da organização);
//   - executa tudo em UMA transação e confere quantidades e integridade antes do COMMIT;
//   - sem `--apply`, faz apenas a simulação e termina com ROLLBACK.
//
// Uso:  node scripts/organize-demo-data.js            (simulação)
//       node scripts/organize-demo-data.js --apply    (aplica)
//
// Reversão: restaurar o dump de backups/ ou copiar de volta as tabelas de `oficinatech_original`.
// Detalhes em docs/organizacao-dados-demo.md.

require('dotenv').config({ quiet: true });

const assert = require('node:assert/strict');
const mysql = require('mysql2/promise');
const { MECANICOS, PECAS, SERVICOS, QUANTIDADES } = require('../database/seeds/catalogo-demo');

const APPLY = process.argv.includes('--apply');
const ARCHIVE_DB = 'oficinatech_original';

// Registros cadastrados manualmente (não vieram dos testes): ficam intocados.
const CLIENTES_REAIS = [620, 650, 652];
const OS_REAIS = [508, 509];
const VEICULO_REAL_SEM_DONO_VALIDO = { idVeiculo: 582, idCliente: 650 }; // estava vinculado a um cadastro de teste
const VEICULO_REAL = 584;

// Um cadastro existente por mecânico; os duplicados criados pelos testes são unificados nele.
const MECANICOS_MANTIDOS = [
  { nomeBase: 'Rafael Almeida', idMecanico: 177, email: null },
  { nomeBase: 'Bruno Carvalho', idMecanico: 15, email: 'bruno.mecanico@example.com' },
  { nomeBase: 'João Pedro Santos', idMecanico: 18, email: 'joao.mecanico@example.com' },
  { nomeBase: 'Gabriel Nunes', idMecanico: 106, email: 'gabriel.mecanico@example.com' }
];
const MECANICO_NOVO = { nome: 'Arthur Fonseca', email: 'arthur.mecanico@example.com' };

// Ordens mantidas (todas originais: mesmos números, datas de abertura e históricos).
const OS_ABERTAS_COM_MECANICO = [2, 4, 53, 87, 197, 300, 320, 360, 460, 593, 660, 671, 693, 715, 737, 759, 781];
const OS_ABERTA_COM_PECA = 788;
const OS_ABERTAS_COM_SERVICO = [790, 789, 768, 767, 746];
const OS_ABERTAS_COMPLEMENTO = 5; // as mais recentes sem itens, escolhidas por consulta
const OS_OUTROS_STATUS = {
  EM_DIAGNOSTICO: [794, 772],
  AGUARDANDO_PECAS: [780, 758],
  EM_EXECUCAO: [779, 757],
  CONCLUIDA: [797, 775, 753, 731],
  CANCELADA: [791, 769]
};
const SERVICO_DAS_CONCLUIDAS = {
  797: 'Alinhamento de direção',
  775: 'Alinhamento de direção',
  753: 'Diagnóstico via scanner eletrônico',
  731: 'Diagnóstico via scanner eletrônico'
};
// Ordens encerradas passam a compor o histórico de um veículo mantido (o da ordem indicada).
const VEICULO_DAS_ENCERRADAS = { 797: 2, 775: 53, 753: 87, 731: 197, 791: 300, 769: 320 };

// Cadastros existentes que correspondem a itens pedidos: mantêm o ID e o histórico.
const PECAS_EXISTENTES = { 'Pastilhas de freio': 7, 'Velas de ignição': 10, 'Filtro de ar do motor': 326, 'Filtro de combustível': 475 };
const SERVICO_BALANCEAMENTO = 49;

// Clientes de demonstração: cadastros de teste existentes, com dados fictícios coerentes.
// `os` lista as ordens abertas/em andamento do cliente (F1..F5 = ordens de complemento).
const CLIENTES_DEMO = [
  { id: 284, nome: 'Marcos Antônio Pereira', doc: ['cpf', 301], fone: '(41) 99812-3401', email: 'marcos.pereira@example.com', endereco: 'Rua João Bettega, 1540 - Portão, Curitiba - PR', os: [508] },
  { id: 20, nome: 'Transportes Araucária Ltda', doc: ['cnpj', 412], fone: '(41) 3345-2200', email: 'frota@transportesaraucaria.example.com', endereco: 'Rua Senador Accioly Filho, 890 - CIC, Curitiba - PR', os: [2, 671, 693, 715, 737, 759] },
  { id: 26, nome: 'Padaria Pão da Serra Ltda', doc: ['cnpj', 587], fone: '(41) 3278-4410', email: 'contato@paodaserra.example.com', endereco: 'Avenida República Argentina, 2310 - Água Verde, Curitiba - PR', os: [4, 781, 788, 790, 794] },
  { id: 84, nome: 'Mariana Souza Lima', doc: ['cpf', 302], fone: '(41) 99745-1182', email: 'mariana.lima@example.com', endereco: 'Rua Padre Anchieta, 2050 - Bigorrilho, Curitiba - PR', os: [53, 789, 772] },
  { id: 121, nome: 'Carlos Eduardo Tavares', doc: ['cpf', 303], fone: '(41) 99633-9027', email: 'carlos.tavares@example.com', endereco: 'Rua Itupava, 1299 - Alto da XV, Curitiba - PR', os: [87, 768, 780] },
  { id: 265, nome: 'Fernanda Albuquerque', doc: ['cpf', 304], fone: '(41) 99921-5560', email: 'fernanda.albuquerque@example.com', endereco: 'Rua Mateus Leme, 4700 - São Lourenço, Curitiba - PR', os: [197, 767, 758] },
  { id: 392, nome: 'José Roberto Ribas', doc: ['cpf', 305], fone: '(41) 99518-7743', email: 'jose.ribas@example.com', endereco: 'Rua Francisco Derosso, 3120 - Xaxim, Curitiba - PR', os: [300, 746, 779] },
  { id: 417, nome: 'Patrícia Gomes Ferraz', doc: ['cpf', 306], fone: '(41) 99876-2014', email: 'patricia.ferraz@example.com', endereco: 'Avenida Manoel Ribas, 5875 - Santa Felicidade, Curitiba - PR', os: [320, 'F1', 757] },
  { id: 467, nome: 'Lucas Henrique Martins', doc: ['cpf', 307], fone: '(41) 99702-6638', email: 'lucas.martins@example.com', endereco: 'Rua Izaac Ferreira da Cruz, 2000 - Sítio Cercado, Curitiba - PR', os: [360, 'F2'] },
  { id: 589, nome: 'Beatriz Nogueira', doc: ['cpf', 308], fone: '(41) 99654-8891', email: 'beatriz.nogueira@example.com', endereco: 'Rua Nilo Peçanha, 1010 - Bom Retiro, Curitiba - PR', os: [460, 'F3'] },
  { id: 764, nome: 'Ricardo Moura', doc: ['cpf', 309], fone: '(41) 99587-4405', email: 'ricardo.moura@example.com', endereco: 'Rua Eduardo Pinto da Rocha, 640 - Alto Boqueirão, Curitiba - PR', os: [593, 'F4'] },
  { id: 841, nome: 'Juliana Campos Prado', doc: ['cpf', 310], fone: '(41) 99833-1276', email: 'juliana.prado@example.com', endereco: 'Rua Anne Frank, 3555 - Boqueirão, Curitiba - PR', os: [660, 'F5'] }
];

// Veículo de cada ordem aberta ou em andamento (cada ordem mantém o veículo original, normalizado).
const VEICULOS_DEMO = {
  508: ['BRA3F41', 'Volkswagen', 'Gol', 2016, 'Prata'],
  2: ['AZK7C20', 'Fiat', 'Fiorino', 2020, 'Branco'],
  671: ['BCN4H87', 'Renault', 'Master', 2019, 'Branco'],
  693: ['AYT9D03', 'Fiat', 'Strada', 2021, 'Branco'],
  715: ['BEQ2J56', 'Volkswagen', 'Saveiro', 2019, 'Prata'],
  737: ['BDL8A74', 'Mercedes-Benz', 'Sprinter', 2020, 'Branco'],
  759: ['AXV5G12', 'Fiat', 'Ducato', 2018, 'Branco'],
  4: ['BFM1K39', 'Fiat', 'Fiorino', 2019, 'Branco'],
  781: ['AWR6B95', 'Renault', 'Kangoo', 2018, 'Branco'],
  788: ['BGH3E68', 'Volkswagen', 'Gol', 2017, 'Branco'],
  790: ['AVP0F27', 'Fiat', 'Uno', 2015, 'Vermelho'],
  794: ['BHS7I81', 'Chevrolet', 'Montana', 2020, 'Prata'],
  53: ['BJT4C15', 'Chevrolet', 'Onix', 2021, 'Prata'],
  789: ['AUM2D60', 'Hyundai', 'HB20', 2019, 'Branco'],
  772: ['BKX9H34', 'Jeep', 'Renegade', 2020, 'Verde'],
  87: ['BLA6J72', 'Toyota', 'Corolla', 2019, 'Preto'],
  768: ['ATG8A09', 'Honda', 'Fit', 2016, 'Prata'],
  780: ['BMC1G46', 'Fiat', 'Mobi', 2020, 'Laranja'],
  197: ['BND5B83', 'Volkswagen', 'Polo', 2022, 'Branco'],
  767: ['ASF3K18', 'Ford', 'Ka', 2019, 'Azul'],
  758: ['BPE0E57', 'Renault', 'Sandero', 2018, 'Vermelho'],
  300: ['BQF7F91', 'Honda', 'Civic', 2017, 'Prata'],
  746: ['ARJ4I25', 'Nissan', 'Kicks', 2021, 'Cinza'],
  779: ['BRG2C64', 'Chevrolet', 'S10', 2019, 'Preto'],
  320: ['BSH9D30', 'Fiat', 'Argo', 2022, 'Cinza'],
  F1: ['AQK6H78', 'Renault', 'Kwid', 2021, 'Branco'],
  757: ['BTI1J43', 'Toyota', 'Hilux', 2018, 'Prata'],
  360: ['BUJ8A16', 'Hyundai', 'Creta', 2022, 'Azul'],
  F2: ['APL5G52', 'Volkswagen', 'Fox', 2015, 'Vermelho'],
  460: ['BVK3B89', 'Toyota', 'Etios', 2018, 'Azul'],
  F3: ['AOM0K21', 'Peugeot', '208', 2021, 'Branco'],
  593: ['BWL7E66', 'Chevrolet', 'Prisma', 2017, 'Preto'],
  F4: ['ANN4F37', 'Citroën', 'C3', 2019, 'Cinza'],
  660: ['BXM2I94', 'Ford', 'EcoSport', 2017, 'Prata'],
  F5: ['AMP9C08', 'Volkswagen', 'Voyage', 2019, 'Prata']
};

// Descrições coerentes para as ordens que vieram dos testes: [diagnóstico, observações, km, previsão em dias].
const TEXTOS_OS = {
  2: ['Revisão dos 60.000 km da frota.', 'Trocar óleo, filtros e verificar freios.', 61200, 2],
  4: ['Barulho na suspensão dianteira ao passar em lombadas.', 'Veículo de entregas; cliente precisa do carro até sexta-feira.', 88400, 3],
  53: ['Pedal de freio baixo e ruído ao frear.', 'Verificar pastilhas, discos e fluido.', 47300, 2],
  87: ['Volante vibrando e carro puxando para a direita.', 'Cliente trocou os pneus dianteiros há um mês.', 52100, 4],
  197: ['Direção pesada e rangido ao esterçar.', 'Verificar terminais e pivôs.', 33800, 5],
  300: ['Luz de injeção acesa e marcha lenta irregular.', 'Falha intermitente, mais frequente com o motor frio.', 96500, 3],
  320: ['Dificuldade para engatar a ré e trepidação ao sair.', 'Avaliar kit de embreagem.', 74200, 6],
  360: ['Freio de mão sem pressão.', 'Verificar lonas e tambores traseiros.', 58900, 4],
  460: ['Desgaste irregular dos pneus dianteiros.', 'Cliente solicita alinhamento e avaliação da suspensão.', 41700, 2],
  593: ['Folga na direção e estalos em curvas.', 'Verificar junta homocinética e coifas.', 67300, 5],
  660: ['Motor falhando em subidas.', 'Verificar velas, bobinas e bicos injetores.', 112400, 3],
  671: ['Superaquecimento em trânsito lento.', "Verificar bomba d'água, radiador e ventoinha.", 134800, 4],
  693: ['Vazamento de óleo no cárter.', 'Trocar a junta e conferir o nível.', 99100, 2],
  715: ['Revisão preventiva antes de viagem.', 'Checar freios, correias e fluidos.', 82600, 6],
  737: ['Correia dentada no limite de troca.', 'Trocar correia e tensores conforme o plano de manutenção.', 119700, 7],
  759: ['Ar-condicionado não gela.', 'Verificar carga de gás e filtro de cabine.', 76300, 5],
  781: ['Consumo de combustível acima do normal.', 'Cliente pede limpeza de bicos e troca de filtros.', 58200, 8],
  788: ['Motor engasgando em aceleração.', 'Filtro de combustível substituído; aguardando teste de rodagem.', 91400, 1],
  790: ['Vibração no volante acima de 80 km/h.', 'Balanceamento das quatro rodas.', 36900, 1],
  789: ['Trepidação após a troca de pneus.', 'Balancear e conferir a calibragem.', 28400, 2],
  768: ['Volante tremendo em rodovia.', 'Balanceamento solicitado pelo cliente.', 63500, 2],
  767: ['Ruído de rodagem e vibração leve.', 'Balancear rodas e avaliar rolamentos.', 71800, 3],
  746: ['Vibração na carroceria em alta velocidade.', 'Balanceamento e rodízio dos pneus.', 44600, 3],
  F1: ['Troca de óleo e filtros.', 'Cliente trará o óleo de sua preferência.', 20100, 1],
  F2: ['Embreagem alta e cheiro de queimado.', 'Orçar kit de embreagem.', 143900, 7],
  F3: ['Barulho metálico ao passar em buracos.', 'Avaliar amortecedores e molas.', 39800, 4],
  F4: ['Marcha lenta oscilando.', 'Fazer diagnóstico por scanner.', 87700, 2],
  F5: ['Luz da bateria acendendo no painel.', 'Testar alternador e bateria.', 68200, 3],
  794: ['Perda de potência e fumaça branca no escapamento.', 'Suspeita de junta do cabeçote; aguardar teste de pressão.', 156300, 5],
  772: ['Ruído no motor em marcha lenta.', 'Em análise pelo mecânico responsável.', 104500, 3],
  780: ['Cubo de roda dianteiro com folga.', 'Peça sem estoque; pedido feito ao fornecedor.', 92300, 6],
  758: ['Junta homocinética estalando em curvas.', 'Aguardando a chegada da junta do lado esquerdo.', 81200, 4],
  779: ['Troca de amortecedores dianteiros.', 'Serviço em andamento no elevador 2.', 110900, 1],
  757: ['Substituição de pastilhas e discos dianteiros.', 'Cliente aguardando na recepção.', 54700, 1],
  797: ['Carro puxando para a esquerda.', 'Alinhamento realizado; veículo entregue.', 31200, null],
  775: ['Volante torto após passar em buraco.', 'Alinhamento realizado e geometria conferida.', 66100, null],
  753: ['Luz de injeção acesa no painel.', 'Falha apagada após o diagnóstico; sensor reconectado.', 49800, null],
  731: ['Falha intermitente no câmbio automático.', 'Leitura de falhas realizada; sem códigos ativos.', 72900, null],
  791: ['Orçamento para troca do kit de embreagem.', 'Cliente não aprovou o orçamento.', 128400, null],
  769: ['Barulho no escapamento.', 'Cliente desistiu do serviço.', 97600, null]
};

function digitoModulo11(digits, weights) {
  const total = digits.reduce((sum, digit, index) => sum + digit * weights[index], 0);
  const rest = total % 11;
  return rest < 2 ? 0 : 11 - rest;
}

// Documentos fictícios, apenas com formato e dígitos verificadores coerentes.
function documentoFicticio([tipo, semente]) {
  if (tipo === 'cpf') {
    const base = String(100000000 + semente * 7919).slice(0, 9).split('').map(Number);
    const d1 = digitoModulo11(base, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
    const d2 = digitoModulo11([...base, d1], [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
    const text = [...base, d1, d2].join('');
    return `${text.slice(0, 3)}.${text.slice(3, 6)}.${text.slice(6, 9)}-${text.slice(9)}`;
  }
  const base = `${String(10000000 + semente * 104729).slice(0, 8)}0001`.split('').map(Number);
  const d1 = digitoModulo11(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = digitoModulo11([...base, d1], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const text = [...base, d1, d2].join('');
  return `${text.slice(0, 2)}.${text.slice(2, 5)}.${text.slice(5, 8)}/${text.slice(8, 12)}-${text.slice(12)}`;
}

const TABELAS = ['usuarios', 'mecanicos', 'clientes', 'veiculos', 'servicos', 'pecas', 'ordens_servico', 'os_servicos', 'os_pecas', 'movimentos_estoque', 'historico_status_os'];

async function contagens(connection, schema = null) {
  const prefix = schema ? `\`${schema}\`.` : '';
  const result = {};
  for (const table of TABELAS) {
    const [[row]] = await connection.query(`SELECT COUNT(*) AS total FROM ${prefix}${table}`);
    result[table] = Number(row.total);
  }
  return result;
}

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });
  const query = async (sql, params = []) => (await connection.query(sql, params))[0];
  const one = async (sql, params = []) => (await query(sql, params))[0];

  try {
    // ---- Pré-condições ---------------------------------------------------------------------
    const banco = (await one('SELECT DATABASE() AS nome')).nome;
    assert.ok(!/_test$|_original$/.test(banco), `Este script organiza apenas o banco principal (atual: ${banco}).`);
    const antes = await contagens(connection);
    if (antes.clientes === QUANTIDADES.clientes && antes.pecas === QUANTIDADES.pecas) {
      console.log('A base já está organizada; nada a fazer.');
      return;
    }
    const arquivo = await one('SELECT COUNT(*) AS total FROM information_schema.schemata WHERE schema_name = ?', [ARCHIVE_DB]);
    assert.equal(Number(arquivo.total), 1, `Crie antes o banco de arquivo ${ARCHIVE_DB} com a cópia completa do original.`);
    assert.deepEqual(await contagens(connection, ARCHIVE_DB), antes, 'O banco de arquivo precisa ser idêntico ao banco atual antes da organização.');

    const admin = await one(
      `SELECT u.id_usuario FROM usuarios u JOIN perfis p ON p.id_perfil = u.id_perfil
       WHERE p.nome = 'ADMINISTRADOR' AND u.ativo = TRUE AND LENGTH(u.senha_hash) = 60 ORDER BY u.id_usuario LIMIT 1`
    );
    const atendente = await one(
      `SELECT u.id_usuario FROM usuarios u JOIN perfis p ON p.id_perfil = u.id_perfil
       WHERE p.nome = 'ATENDENTE' AND u.ativo = TRUE AND LENGTH(u.senha_hash) = 60 ORDER BY u.id_usuario LIMIT 1`
    );
    assert.ok(admin && atendente, 'Contas reais de administrador e atendente não encontradas.');
    const perfilMecanico = (await one("SELECT id_perfil FROM perfis WHERE nome = 'MECANICO'")).id_perfil;
    const status = Object.fromEntries((await query('SELECT id_status_os, codigo FROM status_os')).map((row) => [row.codigo, row.id_status_os]));

    await connection.beginTransaction();

    // ---- 1. Mecânicos: um cadastro por pessoa ----------------------------------------------
    for (const mecanico of MECANICOS_MANTIDOS) {
      const row = await one(
        `SELECT m.id_usuario, u.nome FROM mecanicos m JOIN usuarios u ON u.id_usuario = m.id_usuario WHERE m.id_mecanico = ?`,
        [mecanico.idMecanico]
      );
      assert.ok(row && row.nome.replace(/ \d+$/, '') === mecanico.nomeBase, `Mecânico ${mecanico.idMecanico} não é ${mecanico.nomeBase}.`);
      mecanico.idUsuario = row.id_usuario;
    }
    const rafael = MECANICOS_MANTIDOS[0];
    const rafaelUser = await one('SELECT LENGTH(senha_hash) AS tamanho, ativo FROM usuarios WHERE id_usuario = ?', [rafael.idUsuario]);
    assert.ok(rafaelUser.tamanho === 60 && rafaelUser.ativo === 1, 'O cadastro do Rafael deve ser o que possui senha real e está ativo.');

    const duplicados = await query(
      `SELECT m.id_mecanico, m.id_usuario, REGEXP_REPLACE(u.nome, ' [0-9]+$', '') AS nome_base
       FROM mecanicos m JOIN usuarios u ON u.id_usuario = m.id_usuario`
    );
    const mecanicoCanonico = new Map(); // id_mecanico antigo -> id_mecanico mantido
    const usuarioCanonico = new Map(); // id_usuario antigo -> id_usuario mantido
    for (const row of duplicados) {
      const destino = MECANICOS_MANTIDOS.find((mecanico) => mecanico.nomeBase === row.nome_base);
      if (destino) {
        mecanicoCanonico.set(row.id_mecanico, destino.idMecanico);
        usuarioCanonico.set(row.id_usuario, destino.idUsuario);
      }
    }

    // ---- 2. Ordens mantidas -----------------------------------------------------------------
    const complemento = await query(
      `SELECT o.id_os FROM ordens_servico o
       WHERE o.id_status_os = ? AND o.id_mecanico IS NULL
         AND o.diagnostico IN ('Dashboard status check', 'Status test')
         AND NOT EXISTS (SELECT 1 FROM os_servicos i WHERE i.id_os = o.id_os)
         AND NOT EXISTS (SELECT 1 FROM os_pecas i WHERE i.id_os = o.id_os)
         AND NOT EXISTS (SELECT 1 FROM historico_status_os h WHERE h.id_os = o.id_os)
       ORDER BY o.id_os DESC LIMIT ?`,
      [status.ABERTA, OS_ABERTAS_COMPLEMENTO]
    );
    assert.equal(complemento.length, OS_ABERTAS_COMPLEMENTO);
    const apelidos = Object.fromEntries(complemento.map((row, index) => [`F${index + 1}`, row.id_os]));
    const idOs = (ref) => (typeof ref === 'string' ? apelidos[ref] : ref);

    const abertas = [...OS_REAIS, ...OS_ABERTAS_COM_MECANICO, OS_ABERTA_COM_PECA, ...OS_ABERTAS_COM_SERVICO, ...Object.values(apelidos)];
    const outras = Object.values(OS_OUTROS_STATUS).flat();
    const mantidas = [...abertas, ...outras];
    assert.equal(new Set(mantidas).size, mantidas.length, 'Lista de ordens mantidas com repetição.');
    assert.equal(abertas.length, QUANTIDADES.osAbertas);

    const linhasOs = await query(
      `SELECT o.id_os, o.id_cliente, o.id_veiculo, o.id_mecanico, s.codigo FROM ordens_servico o
       JOIN status_os s ON s.id_status_os = o.id_status_os WHERE o.id_os IN (?)`,
      [mantidas]
    );
    assert.equal(linhasOs.length, mantidas.length, 'Alguma ordem mantida não existe.');
    const os = new Map(linhasOs.map((row) => [row.id_os, row]));
    for (const id of abertas) assert.equal(os.get(id).codigo, 'ABERTA', `OS ${id} deveria estar aberta.`);
    for (const [codigo, ids] of Object.entries(OS_OUTROS_STATUS)) {
      for (const id of ids) assert.equal(os.get(id).codigo, codigo, `OS ${id} deveria estar em ${codigo}.`);
    }
    const comPecas = await query('SELECT DISTINCT id_os FROM os_pecas WHERE id_os IN (?)', [mantidas]);
    assert.deepEqual(comPecas.map((row) => row.id_os), [OS_ABERTA_COM_PECA], 'Somente a OS prevista deve ter peças.');

    // ---- 3. Remoção dos registros de teste ligados às ordens não mantidas -------------------
    const removidos = {};
    const apagar = async (label, sql, params = []) => {
      const result = await query(sql, params);
      removidos[label] = (removidos[label] || 0) + result.affectedRows;
    };
    await apagar('movimentos_estoque', 'DELETE m FROM movimentos_estoque m JOIN os_pecas i ON i.id_os_peca = m.id_os_peca WHERE i.id_os NOT IN (?)', [mantidas]);
    await apagar('os_pecas', 'DELETE FROM os_pecas WHERE id_os NOT IN (?)', [mantidas]);
    await apagar('os_servicos', 'DELETE FROM os_servicos WHERE id_os NOT IN (?)', [mantidas]);
    await apagar('historico_status_os', 'DELETE FROM historico_status_os WHERE id_os NOT IN (?)', [mantidas]);

    // ---- 4. Vínculos das ordens mantidas ----------------------------------------------------
    // 4.1 Históricos registrados pelos Rafaels duplicados passam ao cadastro mantido.
    for (const [antigo, novo] of usuarioCanonico) {
      if (antigo !== novo) await query('UPDATE historico_status_os SET alterado_por = ? WHERE alterado_por = ?', [novo, antigo]);
    }

    // 4.2 Mecânico responsável: duplicados unificados; cadastros de teste sem correspondente saem.
    for (const row of linhasOs) {
      if (row.id_mecanico === null) continue;
      const destino = mecanicoCanonico.get(row.id_mecanico) ?? null;
      if (destino === row.id_mecanico) continue;
      await query('UPDATE ordens_servico SET id_mecanico = ? WHERE id_os = ?', [destino, row.id_os]);
      if (destino === null) {
        assert.ok(OS_REAIS.includes(row.id_os), `OS ${row.id_os} perderia o mecânico sem previsão.`);
        await query(
          `INSERT INTO historico_status_os (id_os, id_status_anterior, id_status_novo, alterado_por, observacao)
           VALUES (?, ?, ?, ?, ?)`,
          [row.id_os, status[row.codigo], status[row.codigo], admin.id_usuario,
            'Responsável removido na organização da base: o cadastro anterior era um registro de teste.']
        );
      }
    }

    // 4.3 Cliente e veículo: cada ordem aberta ou em andamento mantém o próprio veículo.
    const veiculosMantidos = new Set([VEICULO_REAL, VEICULO_REAL_SEM_DONO_VALIDO.idVeiculo]);
    const veiculoDaOs = new Map();
    for (const cliente of CLIENTES_DEMO) {
      for (const ref of cliente.os) {
        const id = idOs(ref);
        const idVeiculo = os.get(id).id_veiculo;
        assert.ok(!veiculosMantidos.has(idVeiculo), `Veículo ${idVeiculo} usado em mais de uma ordem mantida.`);
        veiculosMantidos.add(idVeiculo);
        veiculoDaOs.set(id, { idVeiculo, idCliente: cliente.id });
        const [placa, marca, modelo, ano, cor] = VEICULOS_DEMO[ref];
        await query(
          'UPDATE veiculos SET id_cliente = ?, placa = ?, chassi = NULL, marca = ?, modelo = ?, ano = ?, cor = ?, ativo = TRUE WHERE id_veiculo = ?',
          [cliente.id, placa, marca, modelo, ano, cor, idVeiculo]
        );
        await query('UPDATE ordens_servico SET id_cliente = ? WHERE id_os = ?', [cliente.id, id]);
      }
    }
    await query('UPDATE veiculos SET id_cliente = ? WHERE id_veiculo = ?', [VEICULO_REAL_SEM_DONO_VALIDO.idCliente, VEICULO_REAL_SEM_DONO_VALIDO.idVeiculo]);
    for (const [encerrada, referencia] of Object.entries(VEICULO_DAS_ENCERRADAS)) {
      const destino = veiculoDaOs.get(referencia);
      await query('UPDATE ordens_servico SET id_cliente = ?, id_veiculo = ? WHERE id_os = ?', [destino.idCliente, destino.idVeiculo, Number(encerrada)]);
    }

    // 4.4 Descrições coerentes nas ordens que vieram dos testes (as reais ficam como estão).
    for (const [ref, [diagnostico, observacoes, km, dias]] of Object.entries(TEXTOS_OS)) {
      const id = idOs(/^F\d$/.test(ref) ? ref : Number(ref));
      await query(
        `UPDATE ordens_servico
         SET diagnostico = ?, observacoes = ?, quilometragem_entrada = ?,
             previsao_conclusao = CASE WHEN ? IS NULL THEN previsao_conclusao
                                       ELSE TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL ? DAY), '17:00:00') END
         WHERE id_os = ?`,
        [diagnostico, observacoes, km, dias, dias ?? 0, id]
      );
    }
    assert.equal(Object.keys(TEXTOS_OS).length, mantidas.length - OS_REAIS.length);

    // ---- 5. Ordens, veículos e clientes fora da base de demonstração ------------------------
    await apagar('ordens_servico', 'DELETE FROM ordens_servico WHERE id_os NOT IN (?)', [mantidas]);
    await apagar('veiculos', 'DELETE FROM veiculos WHERE id_veiculo NOT IN (?)', [[...veiculosMantidos]]);
    const clientesMantidos = [...CLIENTES_REAIS, ...CLIENTES_DEMO.map((cliente) => cliente.id)];
    assert.equal(new Set(clientesMantidos).size, QUANTIDADES.clientes);
    await apagar('clientes', 'DELETE FROM clientes WHERE id_cliente NOT IN (?)', [clientesMantidos]);
    for (const cliente of CLIENTES_DEMO) {
      await query(
        'UPDATE clientes SET nome = ?, documento = ?, telefone = ?, email = ?, endereco = ?, ativo = TRUE WHERE id_cliente = ?',
        [cliente.nome, documentoFicticio(cliente.doc), cliente.fone, cliente.email, cliente.endereco, cliente.id]
      );
    }

    // ---- 6. Serviços ------------------------------------------------------------------------
    const trocaOleo = await one("SELECT MIN(id_servico) AS id FROM servicos WHERE nome = 'Troca de óleo'");
    const servicosExistentes = { 'Balanceamento de rodas': SERVICO_BALANCEAMENTO, 'Troca de óleo do motor': trocaOleo.id };
    const servicoId = new Map();
    for (const servico of SERVICOS) {
      const existente = servicosExistentes[servico.nome];
      if (existente) {
        await query('UPDATE servicos SET nome = ?, descricao = ?, preco_atual = ?, duracao_minutos = ?, ativo = TRUE WHERE id_servico = ?',
          [servico.nome, servico.descricao, servico.preco, servico.duracao, existente]);
        servicoId.set(servico.nome, existente);
      } else {
        const result = await query('INSERT INTO servicos (nome, descricao, preco_atual, duracao_minutos, ativo) VALUES (?, ?, ?, ?, TRUE)',
          [servico.nome, servico.descricao, servico.preco, servico.duracao]);
        servicoId.set(servico.nome, result.insertId);
      }
    }
    // Itens das ordens mantidas apontavam para cópias do mesmo serviço: passam ao cadastro único.
    for (const [encerrada, nome] of Object.entries(SERVICO_DAS_CONCLUIDAS)) {
      const result = await query('UPDATE os_servicos SET id_servico = ?, descricao_snapshot = ? WHERE id_os = ?', [servicoId.get(nome), nome, Number(encerrada)]);
      assert.equal(result.affectedRows, 1, `OS ${encerrada} deveria ter exatamente um serviço.`);
    }
    await query('UPDATE os_servicos SET id_servico = ? WHERE id_os NOT IN (?)', [SERVICO_BALANCEAMENTO, Object.keys(SERVICO_DAS_CONCLUIDAS).map(Number)]);
    const snapshots = await query('SELECT DISTINCT descricao_snapshot FROM os_servicos WHERE id_servico = ?', [SERVICO_BALANCEAMENTO]);
    for (const row of snapshots) assert.match(row.descricao_snapshot, /^Balanceamento/, `Item inesperado no serviço de balanceamento: ${row.descricao_snapshot}`);
    await apagar('servicos', 'DELETE FROM servicos WHERE id_servico NOT IN (?)', [[...servicoId.values()]]);

    // ---- 7. Peças e estoque -----------------------------------------------------------------
    const pecaId = new Map();
    for (const peca of PECAS) {
      const existente = PECAS_EXISTENTES[peca.nome];
      if (existente) {
        await query(
          `UPDATE pecas SET codigo = ?, nome = ?, descricao = ?, categoria = ?, unidade = ?, preco_custo = ?, preco_atual = ?, estoque_minimo = ?, ativo = TRUE
           WHERE id_peca = ?`,
          [`TMP-${existente}`, peca.nome, peca.descricao, peca.categoria, peca.unidade, peca.custo, peca.venda, peca.minimo, existente]
        );
        pecaId.set(peca.nome, existente);
      }
    }
    const pecasExistentes = [...pecaId.values()];
    const osPecaForaDoCatalogo = await one('SELECT COUNT(*) AS total FROM os_pecas WHERE id_peca NOT IN (?)', [pecasExistentes]);
    assert.equal(Number(osPecaForaDoCatalogo.total), 0, 'Há peça de ordem mantida fora do catálogo.');
    await apagar('movimentos_estoque', 'DELETE FROM movimentos_estoque WHERE id_peca NOT IN (?)', [pecasExistentes]);
    await apagar('pecas', 'DELETE FROM pecas WHERE id_peca NOT IN (?)', [pecasExistentes]);
    for (const peca of PECAS) {
      if (pecaId.has(peca.nome)) {
        await query('UPDATE pecas SET codigo = ? WHERE id_peca = ?', [peca.codigo, pecaId.get(peca.nome)]);
      } else {
        const result = await query(
          `INSERT INTO pecas (codigo, nome, descricao, categoria, unidade, preco_custo, preco_atual, estoque_minimo, ativo)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, TRUE)`,
          [peca.codigo, peca.nome, peca.descricao, peca.categoria, peca.unidade, peca.custo, peca.venda, peca.minimo]
        );
        pecaId.set(peca.nome, result.insertId);
      }
    }
    // Inventário inicial: um único ajuste datado por peça, sem simular entradas ou saídas antigas.
    const inventario = [];
    for (const peca of PECAS) {
      const id = pecaId.get(peca.nome);
      const saldo = Number((await one('SELECT COALESCE(SUM(quantidade_delta), 0) AS saldo FROM movimentos_estoque WHERE id_peca = ?', [id])).saldo);
      const delta = peca.saldo - saldo;
      if (delta !== 0) {
        await query(
          `INSERT INTO movimentos_estoque (id_peca, id_os_peca, registrado_por, quantidade_delta, motivo, justificativa, observacao)
           VALUES (?, NULL, ?, ?, 'AJUSTE', 'Inventário inicial', ?)`,
          [id, admin.id_usuario, delta, `Contagem de inventário na organização da base. Saldo anterior: ${saldo}; saldo contado: ${peca.saldo}.`]
        );
      }
      inventario.push({ codigo: peca.codigo, peca: peca.nome, anterior: saldo, contado: peca.saldo, ajuste: delta });
    }

    // ---- 8. Mecânicos e usuários ------------------------------------------------------------
    for (const mecanico of MECANICOS_MANTIDOS) {
      const referencia = MECANICOS.find((item) => mecanico.nomeBase.startsWith(item.primeiroNome));
      await query('UPDATE mecanicos SET especialidade = ?, ativo = TRUE WHERE id_mecanico = ?', [referencia.especialidade, mecanico.idMecanico]);
      if (mecanico.email) {
        await query('UPDATE usuarios SET nome = ?, email = ?, ativo = TRUE WHERE id_usuario = ?', [mecanico.nomeBase, mecanico.email, mecanico.idUsuario]);
      }
    }
    const arthur = await query(
      "INSERT INTO usuarios (id_perfil, nome, email, senha_hash, ativo) VALUES (?, ?, ?, '!senha-nao-definida', TRUE)",
      [perfilMecanico, MECANICO_NOVO.nome, MECANICO_NOVO.email]
    );
    const arthurMecanico = await query('INSERT INTO mecanicos (id_usuario, especialidade, ativo) VALUES (?, ?, TRUE)',
      [arthur.insertId, MECANICOS.find((item) => item.primeiroNome === 'Arthur').especialidade]);
    const mecanicosMantidos = [...MECANICOS_MANTIDOS.map((mecanico) => mecanico.idMecanico), arthurMecanico.insertId];
    const usuariosMantidos = [admin.id_usuario, atendente.id_usuario, ...MECANICOS_MANTIDOS.map((mecanico) => mecanico.idUsuario), arthur.insertId];
    await apagar('mecanicos', 'DELETE FROM mecanicos WHERE id_mecanico NOT IN (?)', [mecanicosMantidos]);
    await apagar('usuarios', 'DELETE FROM usuarios WHERE id_usuario NOT IN (?)', [usuariosMantidos]);

    // ---- 9. Conferência antes do COMMIT -----------------------------------------------------
    const depois = await contagens(connection);
    assert.equal(depois.clientes, QUANTIDADES.clientes);
    assert.equal(depois.mecanicos, QUANTIDADES.mecanicos);
    assert.equal(depois.pecas, QUANTIDADES.pecas);
    assert.equal(depois.servicos, QUANTIDADES.servicos);
    assert.equal(depois.ordens_servico, mantidas.length);
    const abertasAgora = await one('SELECT COUNT(*) AS total FROM ordens_servico WHERE id_status_os = ?', [status.ABERTA]);
    assert.equal(Number(abertasAgora.total), QUANTIDADES.osAbertas);

    const nomesMecanicos = (await query(
      `SELECT u.nome FROM mecanicos m JOIN usuarios u ON u.id_usuario = m.id_usuario JOIN perfis p ON p.id_perfil = u.id_perfil
       WHERE m.ativo = TRUE AND u.ativo = TRUE AND p.nome = 'MECANICO'`
    )).map((row) => row.nome.split(' ')[0]).sort();
    assert.deepEqual(nomesMecanicos, MECANICOS.map((item) => item.primeiroNome).sort());
    assert.deepEqual((await query('SELECT nome FROM pecas ORDER BY nome')).map((row) => row.nome), PECAS.map((item) => item.nome).sort((a, b) => a.localeCompare(b, 'pt-BR')));
    assert.deepEqual(new Set((await query('SELECT nome FROM servicos')).map((row) => row.nome)), new Set(SERVICOS.map((item) => item.nome)));

    for (const peca of PECAS) {
      const row = await one('SELECT saldo_atual FROM vw_saldo_estoque WHERE id_peca = ?', [pecaId.get(peca.nome)]);
      assert.equal(Number(row.saldo_atual), peca.saldo, `Saldo de ${peca.nome}`);
    }

    const chaves = await query(
      `SELECT k.table_name AS tabela, k.column_name AS coluna, k.referenced_table_name AS pai, k.referenced_column_name AS coluna_pai, k.constraint_name AS nome
       FROM information_schema.key_column_usage k
       WHERE k.table_schema = DATABASE() AND k.referenced_table_name IS NOT NULL AND k.ordinal_position = 1
         AND (SELECT COUNT(*) FROM information_schema.key_column_usage k2
              WHERE k2.table_schema = k.table_schema AND k2.constraint_name = k.constraint_name AND k2.table_name = k.table_name) = 1`
    );
    for (const chave of chaves) {
      const orfaos = await one(
        `SELECT COUNT(*) AS total FROM \`${chave.tabela}\` f LEFT JOIN \`${chave.pai}\` p ON p.\`${chave.coluna_pai}\` = f.\`${chave.coluna}\`
         WHERE f.\`${chave.coluna}\` IS NOT NULL AND p.\`${chave.coluna_pai}\` IS NULL`
      );
      assert.equal(Number(orfaos.total), 0, `Registros órfãos em ${chave.nome}`);
    }
    const movimentosOrfaos = await one(
      `SELECT COUNT(*) AS total FROM movimentos_estoque m LEFT JOIN os_pecas i ON i.id_os_peca = m.id_os_peca AND i.id_peca = m.id_peca
       WHERE m.id_os_peca IS NOT NULL AND i.id_os_peca IS NULL`
    );
    assert.equal(Number(movimentosOrfaos.total), 0);
    const veiculoDeOutroCliente = await one('SELECT COUNT(*) AS total FROM ordens_servico o JOIN veiculos v ON v.id_veiculo = o.id_veiculo WHERE v.id_cliente <> o.id_cliente');
    assert.equal(Number(veiculoDeOutroCliente.total), 0, 'Há ordem com veículo de outro cliente.');
    const historicoDivergente = await one(
      `SELECT COUNT(*) AS total FROM ordens_servico o
       JOIN historico_status_os h ON h.id_historico_status = (SELECT MAX(h2.id_historico_status) FROM historico_status_os h2 WHERE h2.id_os = o.id_os)
       WHERE h.id_status_novo <> o.id_status_os`
    );
    assert.equal(Number(historicoDivergente.total), 0, 'Último histórico diferente do status atual.');

    // Registros reais e históricos originais continuam iguais aos do banco de arquivo.
    const iguais = async (label, sql, params) => {
      const row = await one(sql, params);
      assert.equal(Number(row.diferentes), 0, `${label} foi alterado em relação ao original.`);
    };
    await iguais('Cliente real', `SELECT COUNT(*) AS diferentes FROM clientes c JOIN \`${ARCHIVE_DB}\`.clientes a ON a.id_cliente = c.id_cliente
      WHERE c.id_cliente IN (?) AND NOT (c.nome <=> a.nome AND c.documento <=> a.documento AND c.telefone <=> a.telefone AND c.email <=> a.email AND c.endereco <=> a.endereco AND c.ativo <=> a.ativo AND c.criado_em <=> a.criado_em)`, [CLIENTES_REAIS]);
    await iguais('Veículo real', `SELECT COUNT(*) AS diferentes FROM veiculos v JOIN \`${ARCHIVE_DB}\`.veiculos a ON a.id_veiculo = v.id_veiculo
      WHERE v.id_veiculo IN (?) AND NOT (v.placa <=> a.placa AND v.chassi <=> a.chassi AND v.marca <=> a.marca AND v.modelo <=> a.modelo AND v.ano <=> a.ano AND v.cor <=> a.cor AND v.criado_em <=> a.criado_em)`, [[VEICULO_REAL, VEICULO_REAL_SEM_DONO_VALIDO.idVeiculo]]);
    await iguais('OS real', `SELECT COUNT(*) AS diferentes FROM ordens_servico o JOIN \`${ARCHIVE_DB}\`.ordens_servico a ON a.id_os = o.id_os
      WHERE o.id_os IN (?) AND NOT (o.id_veiculo <=> a.id_veiculo AND o.id_status_os <=> a.id_status_os AND o.aberta_em <=> a.aberta_em AND o.previsao_conclusao <=> a.previsao_conclusao AND o.quilometragem_entrada <=> a.quilometragem_entrada AND o.diagnostico <=> a.diagnostico AND o.observacoes <=> a.observacoes)`, [OS_REAIS]);
    await iguais('Abertura/status das ordens mantidas', `SELECT COUNT(*) AS diferentes FROM ordens_servico o JOIN \`${ARCHIVE_DB}\`.ordens_servico a ON a.id_os = o.id_os
      WHERE NOT (o.id_status_os <=> a.id_status_os AND o.aberta_em <=> a.aberta_em AND o.aberta_por <=> a.aberta_por AND o.concluida_em <=> a.concluida_em)`, []);
    await iguais('Histórico de status das ordens mantidas', `SELECT COUNT(*) AS diferentes FROM \`${ARCHIVE_DB}\`.historico_status_os a
      LEFT JOIN historico_status_os h ON h.id_historico_status = a.id_historico_status
      WHERE a.id_os IN (?) AND NOT (h.id_status_anterior <=> a.id_status_anterior AND h.id_status_novo <=> a.id_status_novo AND h.alterado_em <=> a.alterado_em AND h.observacao <=> a.observacao)`, [mantidas]);
    await iguais('Movimentos originais das peças mantidas', `SELECT COUNT(*) AS diferentes FROM \`${ARCHIVE_DB}\`.movimentos_estoque a
      LEFT JOIN movimentos_estoque m ON m.id_movimento = a.id_movimento
      WHERE a.id_peca IN (?) AND NOT (m.quantidade_delta <=> a.quantidade_delta AND m.motivo <=> a.motivo AND m.criado_em <=> a.criado_em AND m.observacao <=> a.observacao AND m.id_os_peca <=> a.id_os_peca)`, [pecasExistentes]);

    // ---- Resumo -----------------------------------------------------------------------------
    console.log(`\nBanco: ${banco} | modo: ${APPLY ? 'APLICAR' : 'SIMULAÇÃO (rollback)'}`);
    console.table(Object.fromEntries(TABELAS.map((table) => [table, { antes: antes[table], depois: depois[table] }])));
    console.log('Registros de teste removidos (preservados em', `${ARCHIVE_DB}):`, JSON.stringify(removidos));
    console.log('Ordens mantidas:', mantidas.length, '| abertas:', abertas.length, '| complemento:', JSON.stringify(apelidos));
    console.log('\nInventário inicial:');
    console.table(inventario);

    if (APPLY) {
      await connection.commit();
      console.log('\nCOMMIT realizado.');
    } else {
      await connection.rollback();
      console.log('\nSimulação concluída sem erros; ROLLBACK executado. Use --apply para gravar.');
    }
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(`\nOrganização interrompida, nada foi gravado: ${error.message}`);
  process.exitCode = 1;
});
