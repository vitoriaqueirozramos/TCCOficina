(async () => {
  const { esc } = OT;
  if (!await OT.initPage('pecas')) return;
  OTPecaForm.mount();

  const list = OT.crud({
    resource: 'pecas',
    listKey: 'pecas',
    itemKey: 'peca',
    idKey: 'id_peca',
    singular: 'peça',
    feminine: true,
    pageSize: 20,
    itemName: (peca) => peca.nome,
    columns: [
      { label: 'Código', render: (peca) => `<span class="code">${esc(peca.codigo)}</span>` },
      { label: 'Peça', render: (peca) => `<span class="cell-main">${esc(peca.nome)}</span><span class="cell-sub">${esc(peca.descricao || 'Sem descrição')}</span>` },
      { label: 'Categoria', render: (peca) => esc(peca.categoria) },
      { label: 'Custo', className: 'num', render: (peca) => OT.money(peca.preco_custo) },
      { label: 'Venda', className: 'num', render: (peca) => OT.money(peca.preco_atual) },
      { label: 'Saldo', className: 'num', render: (peca) => `${OT.number(peca.saldo_atual)} <span class="muted">${esc(peca.unidade)}</span>` }
    ],
    beforeOpen: (form) => OTPecaForm.prepare(form),
    fill: (form, peca) => OTPecaForm.fill(form, peca),
    read: (form) => OTPecaForm.read(form)
  });

  await list.load();
})();
