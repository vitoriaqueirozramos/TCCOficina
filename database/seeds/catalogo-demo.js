// Catálogo de referência da base de demonstração do OFICINATECH.
// Fonte única usada por scripts/organize-demo-data.js e scripts/audit-demo-data.js.

const MECANICOS = [
  { primeiroNome: 'Rafael', especialidade: 'Mecânica geral' },
  { primeiroNome: 'Bruno', especialidade: 'Suspensão e direção' },
  { primeiroNome: 'Arthur', especialidade: 'Elétrica e injeção eletrônica' },
  { primeiroNome: 'João', especialidade: 'Motor e câmbio' },
  { primeiroNome: 'Gabriel', especialidade: 'Freios e alinhamento' }
];

// saldo = saldo contado no inventário inicial da base de demonstração.
const PECAS = [
  { codigo: 'FRE-001', nome: 'Pastilhas de freio', categoria: 'Freios', unidade: 'JG', custo: 78.0, venda: 129.9, minimo: 6, saldo: 14, descricao: 'Jogo de pastilhas dianteiras' },
  { codigo: 'FRE-002', nome: 'Discos de freio', categoria: 'Freios', unidade: 'PAR', custo: 165.0, venda: 289.9, minimo: 4, saldo: 8, descricao: 'Par de discos ventilados dianteiros' },
  { codigo: 'FRE-003', nome: 'Tambor de freio', categoria: 'Freios', unidade: 'UN', custo: 110.0, venda: 189.9, minimo: 2, saldo: 4, descricao: 'Tambor de freio traseiro' },
  { codigo: 'FRE-004', nome: 'Cilindro mestre', categoria: 'Freios', unidade: 'UN', custo: 210.0, venda: 349.9, minimo: 2, saldo: 3, descricao: 'Cilindro mestre de freio' },
  { codigo: 'IGN-001', nome: 'Velas de ignição', categoria: 'Ignição', unidade: 'UN', custo: 14.5, venda: 29.9, minimo: 16, saldo: 40, descricao: 'Vela de ignição automotiva' },
  { codigo: 'IGN-002', nome: 'Bobina de ignição', categoria: 'Ignição', unidade: 'UN', custo: 145.0, venda: 249.9, minimo: 3, saldo: 5, descricao: 'Bobina de ignição individual' },
  { codigo: 'MOT-001', nome: 'Pistão', categoria: 'Motor', unidade: 'UN', custo: 180.0, venda: 319.9, minimo: 4, saldo: 4, descricao: 'Pistão com anéis, medida padrão' },
  { codigo: 'MOT-002', nome: 'Junta do cabeçote', categoria: 'Motor', unidade: 'UN', custo: 95.0, venda: 179.9, minimo: 3, saldo: 2, descricao: 'Junta do cabeçote em aço multicamadas' },
  { codigo: 'MOT-003', nome: 'Correia dentada', categoria: 'Motor', unidade: 'UN', custo: 68.0, venda: 129.9, minimo: 5, saldo: 7, descricao: 'Correia dentada de sincronismo' },
  { codigo: 'SUS-001', nome: 'Amortecedores', categoria: 'Suspensão', unidade: 'PAR', custo: 320.0, venda: 549.9, minimo: 4, saldo: 6, descricao: 'Par de amortecedores dianteiros' },
  { codigo: 'SUS-002', nome: 'Molas helicoidais', categoria: 'Suspensão', unidade: 'PAR', custo: 190.0, venda: 329.9, minimo: 2, saldo: 4, descricao: 'Par de molas helicoidais' },
  { codigo: 'SUS-003', nome: 'Pivô de suspensão', categoria: 'Suspensão', unidade: 'UN', custo: 58.0, venda: 99.9, minimo: 6, saldo: 3, descricao: 'Pivô inferior da bandeja' },
  { codigo: 'SUS-004', nome: 'Cubo de roda', categoria: 'Suspensão', unidade: 'UN', custo: 135.0, venda: 239.9, minimo: 2, saldo: 0, descricao: 'Cubo de roda dianteiro' },
  { codigo: 'SUS-005', nome: 'Rolamento de roda', categoria: 'Suspensão', unidade: 'UN', custo: 72.0, venda: 129.9, minimo: 4, saldo: 9, descricao: 'Rolamento de roda dianteira' },
  { codigo: 'TRA-001', nome: 'Kit de embreagem', categoria: 'Transmissão', unidade: 'KIT', custo: 480.0, venda: 799.9, minimo: 2, saldo: 3, descricao: 'Platô, disco e rolamento' },
  { codigo: 'TRA-002', nome: 'Junta homocinética', categoria: 'Transmissão', unidade: 'UN', custo: 155.0, venda: 269.9, minimo: 3, saldo: 1, descricao: 'Junta homocinética lado roda' },
  { codigo: 'FIL-001', nome: 'Filtro de óleo', categoria: 'Filtros', unidade: 'UN', custo: 18.0, venda: 34.9, minimo: 15, saldo: 32, descricao: 'Filtro de óleo do motor' },
  { codigo: 'FIL-002', nome: 'Filtro de ar do motor', categoria: 'Filtros', unidade: 'UN', custo: 72.0, venda: 129.9, minimo: 10, saldo: 18, descricao: 'Filtro de ar do motor' },
  { codigo: 'FIL-003', nome: 'Filtro de combustível', categoria: 'Filtros', unidade: 'UN', custo: 24.0, venda: 49.9, minimo: 10, saldo: 12, descricao: 'Filtro de combustível de linha' },
  { codigo: 'ARR-001', nome: "Bomba d'água", categoria: 'Arrefecimento', unidade: 'UN', custo: 120.0, venda: 219.9, minimo: 3, saldo: 5, descricao: "Bomba d'água do sistema de arrefecimento" }
];

const SERVICOS = [
  { nome: 'Troca de óleo do motor', preco: 90.0, duracao: 40, descricao: 'Drenagem do óleo usado e reposição conforme especificação do fabricante.' },
  { nome: 'Troca do filtro de óleo', preco: 40.0, duracao: 20, descricao: 'Substituição do filtro de óleo do motor.' },
  { nome: 'Troca do filtro de ar do motor', preco: 35.0, duracao: 15, descricao: 'Substituição do elemento filtrante de ar do motor.' },
  { nome: 'Troca do filtro de combustível', preco: 60.0, duracao: 30, descricao: 'Substituição do filtro de combustível e verificação da linha.' },
  { nome: 'Troca do filtro de cabine', preco: 45.0, duracao: 20, descricao: 'Substituição do filtro de ar da cabine (ar-condicionado).' },
  { nome: 'Troca de pastilhas e discos de freio', preco: 220.0, duracao: 120, descricao: 'Substituição de pastilhas e discos, com limpeza das pinças.' },
  { nome: 'Sangria e troca do fluido de freio', preco: 130.0, duracao: 60, descricao: 'Troca completa do fluido e sangria das quatro rodas.' },
  { nome: 'Alinhamento de direção', preco: 90.0, duracao: 45, descricao: 'Ajuste de convergência, cambagem e cáster.' },
  { nome: 'Balanceamento de rodas', preco: 120.0, duracao: 45, descricao: 'Balanceamento das quatro rodas.' },
  { nome: 'Rodízio de pneus', preco: 60.0, duracao: 30, descricao: 'Troca de posição dos pneus para desgaste uniforme.' },
  { nome: 'Substituição de amortecedores e molas', preco: 380.0, duracao: 180, descricao: 'Troca de amortecedores e molas por eixo, com kits de batente.' },
  { nome: 'Troca de velas e cabos de ignição', preco: 110.0, duracao: 60, descricao: 'Substituição das velas e dos cabos de ignição.' },
  { nome: 'Limpeza de bicos injetores', preco: 180.0, duracao: 90, descricao: 'Limpeza por ultrassom e teste de vazão dos injetores.' },
  { nome: 'Troca da correia dentada e tensores', preco: 420.0, duracao: 210, descricao: 'Substituição da correia de sincronismo, tensor e polias.' },
  { nome: 'Substituição do kit de embreagem', preco: 650.0, duracao: 300, descricao: 'Troca de platô, disco e rolamento de embreagem.' },
  { nome: 'Manutenção do sistema de arrefecimento', preco: 240.0, duracao: 120, descricao: 'Limpeza do sistema, troca do fluido e teste de estanqueidade.' },
  { nome: 'Carga de gás do ar-condicionado', preco: 190.0, duracao: 60, descricao: 'Recolhimento, vácuo e carga de gás refrigerante.' },
  { nome: 'Diagnóstico via scanner eletrônico', preco: 90.0, duracao: 40, descricao: 'Leitura de falhas e parâmetros dos módulos eletrônicos.' },
  { nome: 'Troca da junta do cabeçote', preco: 1200.0, duracao: 480, descricao: 'Remoção do cabeçote, troca da junta e remontagem com torque especificado.' },
  { nome: 'Reparo ou troca da junta homocinética', preco: 280.0, duracao: 150, descricao: 'Substituição da junta homocinética ou da coifa, por lado.' }
];

const QUANTIDADES = { clientes: 15, mecanicos: 5, pecas: 20, servicos: 20, osAbertas: 30 };

module.exports = { MECANICOS, PECAS, SERVICOS, QUANTIDADES };
