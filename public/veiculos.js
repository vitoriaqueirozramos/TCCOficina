(async () => {
  const { esc } = OT;
  if (!await OT.initPage('veiculos')) return;

  const list = OT.crud({
    resource: 'veiculos',
    listKey: 'veiculos',
    itemKey: 'veiculo',
    idKey: 'id_veiculo',
    singular: 'veículo',
    itemName: (veiculo) => `O veículo ${veiculo.placa}`,
    columns: [
      { label: 'Placa', render: (veiculo) => OT.plate(veiculo.placa) },
      {
        label: 'Veículo',
        render: (veiculo) => {
          const details = [veiculo.ano, veiculo.cor].filter(Boolean).join(', ');
          return `<span class="cell-main">${esc(`${veiculo.marca} ${veiculo.modelo}`)}</span><span class="cell-sub">${esc(details || 'Ano e cor não informados')}</span>`;
        }
      },
      { label: 'Cliente', render: (veiculo) => esc(veiculo.cliente_nome) }
    ],
    // O seletor traz todos os clientes ativos; na edição, mantém o dono atual mesmo se inativo.
    async beforeOpen(form, veiculo) {
      const { clientes } = await OT.api('/api/clientes/opcoes');
      if (veiculo && !clientes.some((cliente) => cliente.id_cliente === veiculo.id_cliente)) {
        clientes.push({ id_cliente: veiculo.id_cliente, nome: `${veiculo.cliente_nome} (inativo)` });
      }
      OT.fillSelect(form.elements.id_cliente, clientes, {
        value: (cliente) => cliente.id_cliente,
        label: (cliente) => cliente.nome,
        placeholder: 'Selecione o cliente'
      });
    },
    fill(form, veiculo) {
      for (const field of ['id_cliente', 'placa', 'chassi', 'marca', 'modelo', 'ano', 'cor']) {
        form.elements[field].value = veiculo[field] ?? '';
      }
    },
    read(form) {
      const data = Object.fromEntries(new FormData(form));
      if (!data.id_cliente) throw new Error('Selecione o cliente dono do veículo.');
      if (!data.placa.trim() || !data.marca.trim() || !data.modelo.trim()) throw new Error('Informe placa, marca e modelo.');
      return { ...data, id_cliente: Number(data.id_cliente), ano: data.ano ? Number(data.ano) : null };
    }
  });

  await list.load();
})();
