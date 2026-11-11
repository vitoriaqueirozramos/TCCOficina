const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createPart, request, stockBalance } = require('./support');

const movimento = (body) => request('POST', '/api/estoque/movimentos', body);

test('entrada soma ao saldo e registra o responsável', async () => {
  const peca = await createPart();
  const response = await movimento({ id_peca: peca.id_peca, tipo: 'ENTRADA', quantidade: 10, justificativa: 'Compra de fornecedor', observacao: 'NF 123' });

  assert.equal(response.status, 201);
  assert.equal(response.body.movimento.quantidade_delta, 10);
  assert.equal(response.body.movimento.motivo, 'ENTRADA');
  assert.equal(response.body.movimento.justificativa, 'Compra de fornecedor');
  assert.ok(response.body.movimento.registrado_por_nome, 'o movimento informa quem registrou');
  assert.equal(response.body.saldo_anterior, 0);
  assert.equal(response.body.saldo_atual, 10);
  assert.equal(await stockBalance(peca.id_peca), 10);
});

test('saída é informada com número positivo e o sinal é calculado no servidor', async () => {
  const peca = await createPart();
  await movimento({ id_peca: peca.id_peca, tipo: 'ENTRADA', quantidade: 8 });
  const response = await movimento({ id_peca: peca.id_peca, tipo: 'SAIDA', quantidade: 3, justificativa: 'Venda no balcão' });

  assert.equal(response.status, 201);
  assert.equal(response.body.movimento.quantidade_delta, -3);
  assert.equal(response.body.movimento.motivo, 'SAIDA');
  assert.equal(await stockBalance(peca.id_peca), 5);
});

test('saída maior que o saldo é recusada e o saldo não muda', async () => {
  const peca = await createPart();
  await movimento({ id_peca: peca.id_peca, tipo: 'ENTRADA', quantidade: 2 });
  const response = await movimento({ id_peca: peca.id_peca, tipo: 'SAIDA', quantidade: 3, justificativa: 'Venda no balcão' });

  assert.equal(response.status, 409);
  assert.equal(response.body.saldo_disponivel, 2);
  assert.equal(await stockBalance(peca.id_peca), 2);
});

test('quantidades zero, negativas ou inválidas são recusadas', async () => {
  const peca = await createPart();
  for (const quantidade of [0, -5, 1.5, 'abc', null]) {
    const response = await movimento({ id_peca: peca.id_peca, tipo: 'ENTRADA', quantidade });
    assert.equal(response.status, 400, `quantidade ${quantidade} deve ser recusada`);
  }
  assert.equal(await stockBalance(peca.id_peca), 0);
});

test('saída e ajuste exigem motivo; tipo desconhecido é recusado', async () => {
  const peca = await createPart();
  await movimento({ id_peca: peca.id_peca, tipo: 'ENTRADA', quantidade: 5 });
  assert.equal((await movimento({ id_peca: peca.id_peca, tipo: 'SAIDA', quantidade: 1 })).status, 400);
  assert.equal((await movimento({ id_peca: peca.id_peca, tipo: 'AJUSTE', saldo_contado: 4 })).status, 400);
  assert.equal((await movimento({ id_peca: peca.id_peca, tipo: 'TRANSFERENCIA', quantidade: 1 })).status, 400);
  assert.equal(await stockBalance(peca.id_peca), 5);
});

test('ajuste leva o saldo ao valor contado, para mais ou para menos', async () => {
  const peca = await createPart();
  await movimento({ id_peca: peca.id_peca, tipo: 'ENTRADA', quantidade: 10 });

  const menos = await movimento({ id_peca: peca.id_peca, tipo: 'AJUSTE', saldo_contado: 7, justificativa: 'Contagem de inventário' });
  assert.equal(menos.status, 201);
  assert.equal(menos.body.movimento.quantidade_delta, -3);

  const mais = await movimento({ id_peca: peca.id_peca, tipo: 'AJUSTE', saldo_contado: 9, justificativa: 'Contagem de inventário' });
  assert.equal(mais.body.movimento.quantidade_delta, 2);
  assert.equal(await stockBalance(peca.id_peca), 9);

  const igual = await movimento({ id_peca: peca.id_peca, tipo: 'AJUSTE', saldo_contado: 9, justificativa: 'Contagem de inventário' });
  assert.equal(igual.status, 409, 'ajuste sem diferença não gera movimento');
  const negativo = await movimento({ id_peca: peca.id_peca, tipo: 'AJUSTE', saldo_contado: -1, justificativa: 'Contagem de inventário' });
  assert.equal(negativo.status, 400);
});

test('peça inativa não pode ser movimentada', async () => {
  const peca = await createPart();
  await movimento({ id_peca: peca.id_peca, tipo: 'ENTRADA', quantidade: 4 });
  await request('PATCH', `/api/pecas/${peca.id_peca}/ativo`, { ativo: false });

  const response = await movimento({ id_peca: peca.id_peca, tipo: 'ENTRADA', quantidade: 1 });
  assert.equal(response.status, 409);
  assert.equal(await stockBalance(peca.id_peca), 4);
});

test('consumo e estorno só nascem no fluxo da ordem de serviço', async () => {
  const peca = await createPart();
  assert.equal((await movimento({ id_peca: peca.id_peca, tipo: 'CONSUMO_OS', quantidade: 1 })).status, 400);
  assert.equal((await movimento({ id_peca: peca.id_peca, tipo: 'ENTRADA', quantidade: 1, id_os_peca: 1 })).status, 400);
});

test('histórico é paginado e filtra por peça, tipo e período', async () => {
  const peca = await createPart();
  await movimento({ id_peca: peca.id_peca, tipo: 'ENTRADA', quantidade: 6 });
  await movimento({ id_peca: peca.id_peca, tipo: 'SAIDA', quantidade: 1, justificativa: 'Uso interno da oficina' });
  await movimento({ id_peca: peca.id_peca, tipo: 'AJUSTE', saldo_contado: 4, justificativa: 'Contagem de inventário' });

  const todos = await request('GET', `/api/estoque/movimentos?id_peca=${peca.id_peca}&limit=2`);
  assert.equal(todos.status, 200);
  assert.equal(todos.body.movimentos.length, 2, 'respeita o limite da página');
  assert.equal(todos.body.pagination.total, 3);
  assert.equal(todos.body.pagination.pages, 2);

  const saidas = await request('GET', `/api/estoque/movimentos?id_peca=${peca.id_peca}&tipo=SAIDA`);
  assert.deepEqual(saidas.body.movimentos.map((item) => item.motivo), ['SAIDA']);

  const periodo = await request('GET', `/api/estoque/movimentos?id_peca=${peca.id_peca}&de=2000-01-01&ate=2000-12-31`);
  assert.equal(periodo.body.pagination.total, 0);
  const invalido = await request('GET', '/api/estoque/movimentos?ate=31/12/2026');
  assert.equal(invalido.status, 400);

  const resumo = await request('GET', '/api/estoque/movimentos/resumo');
  assert.ok(resumo.body.resumo.total >= 3 && resumo.body.resumo.entradas >= 1 && resumo.body.resumo.saidas >= 1 && resumo.body.resumo.ajustes >= 1);
});

test('posição de estoque classifica disponível, baixo e sem estoque', async () => {
  const peca = await createPart({ estoque_minimo: 5 });
  const situacao = async () => (await request('GET', `/api/estoque/produtos?q=${peca.codigo}`)).body.produtos[0].situacao;

  assert.equal(await situacao(), 'SEM_ESTOQUE');
  await movimento({ id_peca: peca.id_peca, tipo: 'ENTRADA', quantidade: 3 });
  assert.equal(await situacao(), 'BAIXO');
  await movimento({ id_peca: peca.id_peca, tipo: 'ENTRADA', quantidade: 2 });
  assert.equal(await situacao(), 'DISPONIVEL');

  const resumo = await request('GET', '/api/estoque/resumo');
  assert.equal(resumo.status, 200);
  assert.ok(resumo.body.resumo.total_produtos >= 1);
  assert.ok(resumo.body.categorias.includes('Testes'));
});
