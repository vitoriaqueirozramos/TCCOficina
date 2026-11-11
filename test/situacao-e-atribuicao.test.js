const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  cookieFor, createClient, createMechanic, createOrder, createPart, createService, createVehicle, getPool, request, stockBalance
} = require('./support');

// ---- Ativar e inativar ------------------------------------------------------------------------

test('ativar e inativar persistem em clientes, veículos, peças e serviços', async () => {
  const cliente = await createClient();
  const veiculo = await createVehicle(cliente.id_cliente);
  const peca = await createPart();
  const servico = await createService();
  const casos = [
    ['clientes', cliente.id_cliente, 'cliente', 'clientes', 'id_cliente'],
    ['veiculos', veiculo.id_veiculo, 'veiculo', 'veiculos', 'id_veiculo'],
    ['pecas', peca.id_peca, 'peca', 'pecas', 'id_peca'],
    ['servicos', servico.id_servico, 'servico', 'servicos', 'id_servico']
  ];

  for (const [recurso, id, chave, tabela, coluna] of casos) {
    const situacaoNoBanco = async () => (await getPool().execute(`SELECT ativo FROM ${tabela} WHERE ${coluna} = ?`, [id]))[0][0].ativo;

    const inativar = await request('PATCH', `/api/${recurso}/${id}/ativo`, { ativo: false });
    assert.equal(inativar.status, 200, `${recurso}: inativar`);
    assert.equal(inativar.body[chave].ativo, 0, `${recurso}: resposta traz o cadastro inativo`);
    assert.equal(await situacaoNoBanco(), 0, `${recurso}: inativação gravada`);

    const ativar = await request('PATCH', `/api/${recurso}/${id}/ativo`, { ativo: true });
    assert.equal(ativar.status, 200, `${recurso}: ativar`);
    assert.equal(ativar.body[chave].ativo, 1, `${recurso}: resposta traz o cadastro ativo`);
    assert.equal(await situacaoNoBanco(), 1, `${recurso}: ativação gravada`);

    // 1/0 chegam do MySQL; textos fora do padrão são recusados sem alterar nada.
    assert.equal((await request('PATCH', `/api/${recurso}/${id}/ativo`, { ativo: 0 })).status, 200, `${recurso}: aceita 0`);
    assert.equal((await request('PATCH', `/api/${recurso}/${id}/ativo`, { ativo: 'talvez' })).status, 400, `${recurso}: recusa valor inválido`);
    assert.equal((await request('PATCH', `/api/${recurso}/${id}/ativo`, {})).status, 400, `${recurso}: recusa corpo vazio`);
    assert.equal(await situacaoNoBanco(), 0, `${recurso}: valor inválido não altera`);
    assert.equal((await request('PATCH', `/api/${recurso}/999999999/ativo`, { ativo: true })).status, 404, `${recurso}: inexistente`);
  }
});

test('inativar mecânico desativa a conta só quando o perfil é MECANICO', async () => {
  const mecanico = await createMechanic();
  const contaAtiva = async (idUsuario) => (await getPool().execute('SELECT ativo FROM usuarios WHERE id_usuario = ?', [idUsuario]))[0][0].ativo;

  const inativar = await request('PATCH', `/api/mecanicos/${mecanico.id_mecanico}/ativo`, { ativo: false });
  assert.equal(inativar.status, 200);
  assert.equal(inativar.body.mecanico.ativo, 0);
  assert.equal(inativar.body.conta_alterada, true);
  assert.equal(await contaAtiva(mecanico.id_usuario), 0, 'conta de perfil mecânico acompanha a inativação');

  const ativar = await request('PATCH', `/api/mecanicos/${mecanico.id_mecanico}/ativo`, { ativo: true });
  assert.equal(ativar.body.mecanico.ativo, 1);
  assert.equal(await contaAtiva(mecanico.id_usuario), 1);

  // Um atendente que também é mecânico continua com acesso ao sistema.
  const atendente = await createMechanic({ perfil: 'ATENDENTE', nome: 'Atendente Mecânico' });
  const resposta = await request('PATCH', `/api/mecanicos/${atendente.id_mecanico}/ativo`, { ativo: false });
  assert.equal(resposta.status, 200);
  assert.equal(resposta.body.mecanico.ativo, 0);
  assert.equal(resposta.body.conta_alterada, false);
  assert.equal(await contaAtiva(atendente.id_usuario), 1, 'conta administrativa não é desativada');
  const acesso = await request('GET', '/api/clientes', undefined, cookieFor(atendente.id_usuario));
  assert.equal(acesso.status, 200, 'o atendente continua autenticando');
});

// ---- Seletores ----------------------------------------------------------------------------------

test('seletores trazem todos os registros ativos, além do limite de página', async () => {
  const criados = [];
  for (let index = 0; index < 22; index += 1) criados.push(await createMechanic({ nome: `Seletor ${String(index).padStart(2, '0')}` }));
  const inativo = await createMechanic({ nome: 'Seletor Inativo' });
  await request('PATCH', `/api/mecanicos/${inativo.id_mecanico}/ativo`, { ativo: false });

  const paginado = await request('GET', '/api/mecanicos');
  assert.equal(paginado.body.mecanicos.length, 20, 'a tela de cadastro continua paginada');

  const opcoes = await request('GET', '/api/mecanicos/opcoes');
  assert.equal(opcoes.status, 200);
  const ids = opcoes.body.mecanicos.map((item) => item.id_mecanico);
  for (const mecanico of criados) assert.ok(ids.includes(mecanico.id_mecanico), 'todo mecânico ativo aparece no seletor');
  assert.ok(!ids.includes(inativo.id_mecanico), 'mecânico inativo não aparece');

  for (const [url, chave] of [['/api/clientes/opcoes', 'clientes'], ['/api/servicos/opcoes', 'servicos'], ['/api/pecas/opcoes', 'pecas'], ['/api/veiculos/opcoes', 'veiculos']]) {
    const resposta = await request('GET', url);
    assert.equal(resposta.status, 200, url);
    assert.ok(Array.isArray(resposta.body[chave]), url);
  }
});

// ---- Cliente e veículo --------------------------------------------------------------------------

test('abertura de OS confere se o veículo pertence ao cliente', async () => {
  const clienteA = await createClient();
  const clienteB = await createClient();
  const veiculoA = await createVehicle(clienteA.id_cliente);
  await createVehicle(clienteB.id_cliente);

  const lista = await request('GET', `/api/veiculos/opcoes?id_cliente=${clienteA.id_cliente}`);
  assert.deepEqual(lista.body.veiculos.map((item) => item.id_veiculo), [veiculoA.id_veiculo], 'o seletor traz só os veículos do cliente');

  const errado = await request('POST', '/api/ordens-servico', { id_cliente: clienteB.id_cliente, id_veiculo: veiculoA.id_veiculo });
  assert.equal(errado.status, 409);
  assert.match(errado.body.error, /não pertence ao cliente/);

  assert.equal((await request('POST', '/api/ordens-servico', { id_cliente: 999999999, id_veiculo: veiculoA.id_veiculo })).status, 400);
  assert.equal((await request('POST', '/api/ordens-servico', { id_cliente: clienteA.id_cliente, id_veiculo: 999999999 })).status, 400);

  const certo = await request('POST', '/api/ordens-servico', { id_cliente: clienteA.id_cliente, id_veiculo: veiculoA.id_veiculo });
  assert.equal(certo.status, 201);
  const historico = await request('GET', `/api/ordens-servico/${certo.body.ordem.id_os}/historico-status`);
  assert.equal(historico.body.historico.length, 1, 'a abertura entra no histórico');
  assert.equal(historico.body.historico[0].id_status_anterior, null);
});

// ---- Atribuição e reatribuição ------------------------------------------------------------------

test('OS é atribuída na abertura e aparece na área do mecânico', async () => {
  const mecanico = await createMechanic({ nome: 'Rafael Teste' });
  const { ordem } = await createOrder({ idMecanico: mecanico.id_mecanico });
  assert.equal(ordem.id_mecanico, mecanico.id_mecanico);
  assert.equal(ordem.mecanico_nome, 'Rafael Teste');

  const [linhas] = await getPool().execute('SELECT id_mecanico FROM ordens_servico WHERE id_os = ?', [ordem.id_os]);
  assert.equal(linhas[0].id_mecanico, mecanico.id_mecanico, 'o ID correto foi gravado');

  const minhas = await request('GET', '/api/ordens-servico/minhas', undefined, cookieFor(mecanico.id_usuario));
  assert.equal(minhas.status, 200);
  assert.ok(minhas.body.ordens.some((item) => item.id_os === ordem.id_os), 'o mecânico vê a ordem na área pessoal');
});

test('reatribuição troca o responsável, registra histórico e move a ordem de área', async () => {
  const primeiro = await createMechanic({ nome: 'Bruno Teste' });
  const segundo = await createMechanic({ nome: 'Arthur Teste' });
  const { ordem } = await createOrder();
  const rota = `/api/ordens-servico/${ordem.id_os}/mecanico`;

  const definir = await request('PATCH', rota, { id_mecanico: primeiro.id_mecanico });
  assert.equal(definir.status, 200);
  assert.match(definir.body.message, /Responsável definido: Bruno Teste/);

  const trocar = await request('PATCH', rota, { id_mecanico: segundo.id_mecanico, observacao: 'Troca de turno' });
  assert.equal(trocar.status, 200);
  assert.equal(trocar.body.ordem.mecanico_nome, 'Arthur Teste');
  assert.match(trocar.body.message, /Bruno Teste → Arthur Teste/);

  const detalhe = await request('GET', `/api/ordens-servico/${ordem.id_os}`);
  assert.equal(detalhe.body.ordem.id_mecanico, segundo.id_mecanico);

  const trocas = trocar.body.historico.filter((item) => item.tipo === 'RESPONSAVEL');
  assert.equal(trocas.length, 2, 'cada mudança de responsável fica no histórico');
  assert.match(trocas[0].observacao, /Troca de turno/);
  assert.equal(trocas[0].id_status_anterior, trocas[0].id_status_novo, 'o status não muda na troca de responsável');

  const doPrimeiro = await request('GET', '/api/ordens-servico/minhas', undefined, cookieFor(primeiro.id_usuario));
  const doSegundo = await request('GET', '/api/ordens-servico/minhas', undefined, cookieFor(segundo.id_usuario));
  assert.ok(!doPrimeiro.body.ordens.some((item) => item.id_os === ordem.id_os));
  assert.ok(doSegundo.body.ordens.some((item) => item.id_os === ordem.id_os));

  assert.equal((await request('PATCH', rota, { id_mecanico: segundo.id_mecanico })).status, 409, 'mesmo responsável');
  const remover = await request('PATCH', rota, { id_mecanico: null });
  assert.equal(remover.status, 200);
  assert.equal(remover.body.ordem.id_mecanico, null);
});

test('mecânico inativo, inexistente ou inválido não recebe ordens', async () => {
  const inativo = await createMechanic({ nome: 'Inativo Teste' });
  await request('PATCH', `/api/mecanicos/${inativo.id_mecanico}/ativo`, { ativo: false });
  const { ordem, cliente, veiculo } = await createOrder();
  const rota = `/api/ordens-servico/${ordem.id_os}/mecanico`;

  const reatribuir = await request('PATCH', rota, { id_mecanico: inativo.id_mecanico });
  assert.equal(reatribuir.status, 409);
  assert.match(reatribuir.body.error, /inativo/);

  const abrir = await request('POST', '/api/ordens-servico', { id_cliente: cliente.id_cliente, id_veiculo: veiculo.id_veiculo, id_mecanico: inativo.id_mecanico });
  assert.equal(abrir.status, 409, 'abertura com mecânico inativo');

  assert.equal((await request('PATCH', rota, { id_mecanico: 999999999 })).status, 400, 'ID inexistente');
  assert.equal((await request('PATCH', rota, { id_mecanico: 'abc' })).status, 400, 'valor inválido');
  assert.equal((await request('PATCH', rota, {})).status, 400, 'corpo sem id_mecanico');
  assert.equal((await request('PATCH', '/api/ordens-servico/999999999/mecanico', { id_mecanico: null })).status, 404, 'OS inexistente');

  const [linhas] = await getPool().execute('SELECT id_mecanico FROM ordens_servico WHERE id_os = ?', [ordem.id_os]);
  assert.equal(linhas[0].id_mecanico, null, 'tentativas recusadas não alteram a ordem');
});

test('reatribuição exige perfil administrativo e ordem em andamento', async () => {
  const mecanico = await createMechanic();
  const outro = await createMechanic();
  const { ordem } = await createOrder({ idMecanico: mecanico.id_mecanico });
  const rota = `/api/ordens-servico/${ordem.id_os}/mecanico`;

  const comoMecanico = await request('PATCH', rota, { id_mecanico: outro.id_mecanico }, cookieFor(mecanico.id_usuario));
  assert.equal(comoMecanico.status, 403, 'mecânico não reatribui ordens');

  const { body: catalogo } = await request('GET', '/api/ordens-servico/status');
  const cancelada = catalogo.status.find((item) => item.codigo === 'CANCELADA');
  assert.equal((await request('POST', `/api/ordens-servico/${ordem.id_os}/status`, { id_status_os: cancelada.id_status_os })).status, 200);
  assert.equal((await request('PATCH', rota, { id_mecanico: outro.id_mecanico })).status, 409, 'ordem encerrada não muda de responsável');
});

// ---- Peças e serviços inativos ------------------------------------------------------------------

test('peça ou serviço inativo não entra em novas ordens, e o histórico é preservado', async () => {
  const peca = await createPart();
  const servico = await createService();
  await request('POST', '/api/estoque/movimentos', { id_peca: peca.id_peca, tipo: 'ENTRADA', quantidade: 5 });
  const { ordem } = await createOrder();
  const itemBase = { descricao_snapshot: 'Item de teste', quantidade: 1, valor_unitario: 20 };

  const antes = await request('POST', `/api/ordens-servico/${ordem.id_os}/os-pecas`, { id_peca: peca.id_peca, ...itemBase });
  assert.equal(antes.status, 201, 'peça ativa entra na ordem');
  assert.equal(await stockBalance(peca.id_peca), 4);

  await request('PATCH', `/api/pecas/${peca.id_peca}/ativo`, { ativo: false });
  await request('PATCH', `/api/servicos/${servico.id_servico}/ativo`, { ativo: false });

  const depois = await request('POST', `/api/ordens-servico/${ordem.id_os}/os-pecas`, { id_peca: peca.id_peca, ...itemBase });
  assert.equal(depois.status, 409);
  assert.match(depois.body.error, /inativa/);
  const servicoInativo = await request('POST', `/api/ordens-servico/${ordem.id_os}/os-servicos`, { id_servico: servico.id_servico, ...itemBase });
  assert.equal(servicoInativo.status, 409);
  const aumentar = await request('PUT', `/api/ordens-servico/${ordem.id_os}/os-pecas/${antes.body.item.id_os_peca}`, { ...itemBase, quantidade: 2 });
  assert.equal(aumentar.status, 409, 'não aumenta o consumo de peça inativa');

  const itens = await request('GET', `/api/ordens-servico/${ordem.id_os}/os-pecas`);
  assert.equal(itens.body.itens.length, 1, 'o item já lançado continua na ordem');
  assert.equal(await stockBalance(peca.id_peca), 4, 'o saldo não mudou com as tentativas recusadas');
});
