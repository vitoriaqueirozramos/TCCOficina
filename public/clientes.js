(async () => {
  const { esc } = OT;
  if (!await OT.initPage('clientes')) return;

  const list = OT.crud({
    resource: 'clientes',
    listKey: 'clientes',
    itemKey: 'cliente',
    idKey: 'id_cliente',
    singular: 'cliente',
    itemName: (cliente) => cliente.nome,
    columns: [
      { label: 'Cliente', render: (cliente) => `<span class="cell-main">${esc(cliente.nome)}</span><span class="cell-sub">${esc(cliente.endereco || 'Endereço não informado')}</span>` },
      { label: 'Documento', render: (cliente) => esc(cliente.documento || '—') },
      { label: 'Telefone', render: (cliente) => esc(cliente.telefone || '—') },
      { label: 'E-mail', render: (cliente) => esc(cliente.email || '—') }
    ],
    fill(form, cliente) {
      for (const field of ['nome', 'documento', 'telefone', 'email', 'endereco']) {
        form.elements[field].value = cliente[field] || '';
      }
    },
    read(form) {
      const data = Object.fromEntries(new FormData(form));
      if (!data.nome.trim()) throw new Error('Informe o nome do cliente.');
      return data;
    }
  });

  await list.load();
})();
