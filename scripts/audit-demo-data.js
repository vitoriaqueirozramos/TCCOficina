require('dotenv').config({ quiet: true });

const { closePool, getPool } = require('../src/config/database');

const requiredParts = [
  'Pastilhas de freio', 'Discos de freio', 'Tambor de freio', 'Cilindro mestre',
  'Velas de ignição', 'Bobina de ignição', 'Pistão', 'Junta do cabeçote',
  'Amortecedores', 'Molas helicoidais', 'Pivô de suspensão', 'Cubo de roda',
  'Rolamento de roda', 'Kit de embreagem', 'Junta homocinética', 'Filtro de óleo',
  'Filtro de ar do motor', 'Filtro de combustível', 'Correia dentada', 'Bomba d\'água'
];

const requiredServices = [
  'Troca de óleo do motor', 'troca do filtro de óleo', 'troca do filtro de ar do motor',
  'troca do filtro de combustível', 'troca do filtro de cabine', 'troca de pastilhas e discos de freio',
  'sangria e troca do fluido de freio', 'alinhamento de direção', 'balanceamento de rodas',
  'rodízio de pneus', 'substituição de amortecedores e molas', 'troca de velas e cabos de ignição',
  'limpeza de bicos injetores', 'troca da correia dentada e tensores',
  'substituição do kit de embreagem', 'manutenção do sistema de arrefecimento',
  'carga de gás do ar-condicionado', 'diagnóstico via scanner eletrônico',
  'troca da junta do cabeçote', 'reparo ou troca da junta homocinética'
];

async function audit() {
  const pool = getPool();
  const audits = [
    ['clientes', `SELECT COUNT(*) AS total,
                        COALESCE(SUM(ativo = TRUE), 0) AS ativos,
                        COALESCE(SUM(email LIKE ? OR nome LIKE ?), 0) AS provaveis_fixtures
                 FROM clientes`, ['%@example.com', 'Cliente%']],
    ['veiculos', `SELECT COUNT(*) AS total,
                         COALESCE(SUM(ativo = TRUE), 0) AS ativos,
                         COALESCE(SUM(placa REGEXP ?), 0) AS provaveis_fixtures
                  FROM veiculos`, ['^(OS|ST|DB|PP|VH|SS|ED)']],
    ['mecanicos', `SELECT COUNT(*) AS total,
                          COALESCE(SUM(m.ativo = TRUE), 0) AS ativos,
                          COALESCE(SUM(u.email LIKE ? OR u.nome IN (?, ?)), 0) AS provaveis_fixtures
                   FROM mecanicos AS m JOIN usuarios AS u ON u.id_usuario = m.id_usuario`, ['%@example.com', 'Mecânico OS', 'Mecânico Teste']],
    ['pecas', `SELECT COUNT(*) AS total,
                      COALESCE(SUM(ativo = TRUE), 0) AS ativos,
                      COALESCE(SUM(codigo LIKE ? OR codigo LIKE ? OR codigo LIKE ?), 0) AS provaveis_fixtures
               FROM pecas`, ['PEC-%', 'EST-%', 'EDIT-%']],
    ['servicos', `SELECT COUNT(*) AS total,
                         COALESCE(SUM(ativo = TRUE), 0) AS ativos,
                         COALESCE(SUM(nome LIKE ?), 0) AS provaveis_fixtures
                  FROM servicos`, ['Serviço %']],
    ['ordens_por_status', `SELECT s.codigo AS status, COUNT(*) AS total,
                                  COALESCE(SUM(c.email LIKE ? OR c.nome LIKE ?), 0) AS provaveis_fixtures
                           FROM ordens_servico AS os
                           JOIN status_os AS s ON s.id_status_os = os.id_status_os
                           JOIN clientes AS c ON c.id_cliente = os.id_cliente
                           GROUP BY s.codigo ORDER BY s.codigo`, ['%@example.com', 'Cliente%']]
  ];

  for (const [label, sql, parameters] of audits) {
    const [rows] = await pool.execute(sql, parameters);
    console.log(`${label}: ${JSON.stringify(rows)}`);
  }

  for (const [label, table, names] of [['required_parts', 'pecas', requiredParts], ['required_services', 'servicos', requiredServices]]) {
    const placeholders = names.map(() => '?').join(', ');
    const [rows] = await pool.execute(
      `SELECT LOWER(TRIM(nome)) AS nome_normalizado, COUNT(*) AS total
       FROM ${table}
       WHERE LOWER(TRIM(nome)) IN (${placeholders})
       GROUP BY LOWER(TRIM(nome))`,
      names.map((name) => name.toLowerCase())
    );
    console.log(`${label}: ${JSON.stringify({ found: rows.length, required: names.length, entries: rows })}`);
  }

  const [unmarkedParts] = await pool.execute(
    `SELECT nome, COUNT(*) AS total
     FROM pecas
     WHERE codigo NOT LIKE 'PEC-%' AND codigo NOT LIKE 'EST-%' AND codigo NOT LIKE 'EDIT-%'
     GROUP BY nome ORDER BY nome`
  );
  console.log(`unmarked_parts: ${JSON.stringify(unmarkedParts)}`);

  const [unmarkedServices] = await pool.execute(
    `SELECT nome, COUNT(*) AS total
     FROM servicos
     WHERE nome NOT LIKE 'Serviço %'
     GROUP BY nome ORDER BY nome`
  );
  console.log(`unmarked_services: ${JSON.stringify(unmarkedServices)}`);

  const [selectionRows] = await pool.execute(
    `SELECT
       (SELECT COUNT(*) FROM clientes
        WHERE NOT (COALESCE(email, '') LIKE ? OR nome LIKE ?)) AS unmarked_clients,
       (SELECT COUNT(*) FROM ordens_servico AS os
        JOIN status_os AS st ON st.id_status_os = os.id_status_os
        JOIN clientes AS c ON c.id_cliente = os.id_cliente
        WHERE st.codigo = 'ABERTA'
          AND NOT (COALESCE(c.email, '') LIKE ? OR c.nome LIKE ?)) AS unmarked_open_orders,
       (SELECT COUNT(*) FROM (
          SELECT c.id_cliente
          FROM clientes AS c
          JOIN ordens_servico AS os ON os.id_cliente = c.id_cliente
          JOIN status_os AS st ON st.id_status_os = os.id_status_os AND st.codigo = 'ABERTA'
          WHERE COALESCE(c.email, '') LIKE ? OR c.nome LIKE ?
          GROUP BY c.id_cliente
          ORDER BY COUNT(*) DESC
          LIMIT 27
        ) AS top_demo_clients) AS top_demo_client_count,
       (SELECT COALESCE(SUM(open_count), 0) FROM (
          SELECT COUNT(*) AS open_count
          FROM clientes AS c
          JOIN ordens_servico AS os ON os.id_cliente = c.id_cliente
          JOIN status_os AS st ON st.id_status_os = os.id_status_os AND st.codigo = 'ABERTA'
          WHERE COALESCE(c.email, '') LIKE ? OR c.nome LIKE ?
          GROUP BY c.id_cliente
          ORDER BY COUNT(*) DESC
          LIMIT 27
        ) AS top_open_orders) AS open_orders_for_top_demo_clients`,
    ['%@example.com', 'Cliente%', '%@example.com', 'Cliente%', '%@example.com', 'Cliente%', '%@example.com', 'Cliente%']
  );
  console.log(`demo_selection_feasibility: ${JSON.stringify(selectionRows)}`);

  const [mechanicNames] = await pool.execute(
    `SELECT u.nome, COUNT(*) AS total
     FROM mecanicos AS m JOIN usuarios AS u ON u.id_usuario = m.id_usuario
     WHERE u.nome IN (?, ?, ?, ?, ?)
     GROUP BY u.nome ORDER BY u.nome`,
    ['Rafael', 'Bruno', 'Arthur', 'João', 'Gabriel']
  );
  console.log(`required_mechanic_names: ${JSON.stringify(mechanicNames)}`);
}

audit()
  .catch((error) => {
    console.error(`Não foi possível auditar os dados: ${error.code || error.message}`);
    process.exitCode = 1;
  })
  .finally(closePool);
