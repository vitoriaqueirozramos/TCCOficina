(async () => {
  const { esc } = OT;
  if (!await OT.initPage('servicos')) return;

  const list = OT.crud({
    resource: 'servicos',
    listKey: 'servicos',
    itemKey: 'servico',
    idKey: 'id_servico',
    singular: 'serviço',
    pageSize: 20,
    itemName: (servico) => servico.nome,
    columns: [
      { label: 'Serviço', render: (servico) => `<span class="cell-main">${esc(servico.nome)}</span><span class="cell-sub">${esc(servico.descricao || 'Sem descrição')}</span>` },
      { label: 'Duração estimada', render: (servico) => esc(OT.duration(servico.duracao_minutos)) },
      { label: 'Preço', className: 'num', render: (servico) => OT.money(servico.preco_atual) }
    ],
    fill(form, servico) {
      form.elements.nome.value = servico.nome;
      form.elements.descricao.value = servico.descricao || '';
      form.elements.preco_atual.value = Number(servico.preco_atual).toFixed(2);
      form.elements.duracao_minutos.value = servico.duracao_minutos ?? '';
    },
    read(form) {
      const data = Object.fromEntries(new FormData(form));
      if (!data.nome.trim()) throw new Error('Informe o nome do serviço.');
      if (data.preco_atual === '' || Number(data.preco_atual) < 0) throw new Error('Informe um preço válido.');
      return {
        nome: data.nome,
        descricao: data.descricao,
        preco_atual: Number(data.preco_atual),
        duracao_minutos: data.duracao_minutos === '' ? null : Number(data.duracao_minutos)
      };
    }
  });

  await list.load();
})();
