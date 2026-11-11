(async () => {
  const { esc } = OT;
  if (!await OT.initPage('mecanicos')) return;

  const hint = document.querySelector('#usuario-hint');

  const list = OT.crud({
    resource: 'mecanicos',
    listKey: 'mecanicos',
    itemKey: 'mecanico',
    idKey: 'id_mecanico',
    singular: 'mecânico',
    itemName: (mecanico) => mecanico.nome_usuario,
    columns: [
      { label: 'Mecânico', render: (mecanico) => `<span class="cell-main">${esc(mecanico.nome_usuario)}</span><span class="cell-sub">${esc(mecanico.email)}</span>` },
      { label: 'Especialidade', render: (mecanico) => esc(mecanico.especialidade || '—') },
      { label: 'Ordens em andamento', className: 'num', render: (mecanico) => OT.number(mecanico.ordens_em_andamento) }
    ],
    // Novo cadastro: só contas que ainda não são de mecânico. Edição: a conta não muda.
    async beforeOpen(form, mecanico) {
      const select = form.elements.id_usuario;
      if (mecanico) {
        OT.fillSelect(select, [mecanico], { value: (item) => item.id_usuario, label: (item) => item.nome_usuario });
        select.disabled = true;
        hint.hidden = true;
        return;
      }
      const { usuarios } = await OT.api('/api/usuarios');
      const disponiveis = usuarios.filter((usuario) => usuario.id_mecanico === null && OT.toBool(usuario.ativo));
      OT.fillSelect(select, disponiveis, {
        value: (usuario) => usuario.id_usuario,
        label: (usuario) => `${usuario.nome} (${OT.PERFIS[usuario.perfil] || usuario.perfil})`,
        placeholder: disponiveis.length ? 'Selecione a conta' : 'Nenhuma conta disponível'
      });
      select.disabled = false;
      hint.hidden = false;
    },
    fill(form, mecanico) {
      form.elements.especialidade.value = mecanico.especialidade || '';
    },
    read(form) {
      const especialidade = form.elements.especialidade.value.trim();
      if (!especialidade) throw new Error('Informe a especialidade do mecânico.');
      if (form.elements.id_usuario.disabled) return { especialidade };
      if (!form.elements.id_usuario.value) throw new Error('Selecione a conta de acesso do mecânico.');
      return { id_usuario: Number(form.elements.id_usuario.value), especialidade };
    }
  });

  await list.load();
})();
