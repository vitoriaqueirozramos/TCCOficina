(async () => {
  const { esc } = OT;
  if (!await OT.initPage('estoque')) return;
  OTPecaForm.mount();

  const $ = (selector) => document.querySelector(selector);
  const rows = $('#rows');
  const search = $('#search');
  const filterCategoria = $('#filter-categoria');
  const filterSituacao = $('#filter-situacao');
  const filterAtivo = $('#filter-ativo');
  const formDialog = $('#form-dialog');
  const form = $('#form');
  const formError = $('#form-error');
  const historyDialog = $('#history-dialog');
  const COLUMNS = 8;
  const SITUACAO = {
    DISPONIVEL: '<span class="badge ok">Disponível</span>',
    BAIXO: '<span class="badge warn">Estoque baixo</span>',
    SEM_ESTOQUE: '<span class="badge danger">Sem estoque</span>'
  };
  const state = { page: 1, sort: 'nome', direction: 'asc', items: [], editing: null };

  // O painel inicial leva direto à lista de reposição.
  if (new URLSearchParams(window.location.search).get('situacao') === 'reposicao') {
    filterSituacao.value = 'REPOSICAO';
  }

  const showFormError = (message) => {
    formError.textContent = message || '';
    formError.hidden = !message;
  };

  async function loadSummary() {
    const { resumo, categorias } = await OT.api('/api/estoque/resumo');
    $('#stat-total').textContent = OT.number(resumo.total_produtos);
    $('#note-total').innerHTML = `<strong>${OT.number(resumo.unidades)}</strong> unidades somadas`;
    $('#stat-baixo').textContent = OT.number(resumo.estoque_baixo);
    $('#stat-zerado').textContent = OT.number(resumo.sem_estoque);
    $('#stat-valor').textContent = OT.money(resumo.valor_total);

    const pendentes = resumo.estoque_baixo + resumo.sem_estoque;
    const alert = $('#stock-alert');
    if (pendentes > 0) {
      const partes = [];
      if (resumo.estoque_baixo > 0) partes.push(`${resumo.estoque_baixo} com estoque baixo`);
      if (resumo.sem_estoque > 0) partes.push(`${resumo.sem_estoque} sem estoque`);
      $('#stock-alert-text').innerHTML = `<strong>${pendentes} ${pendentes === 1 ? 'peça precisa' : 'peças precisam'} de reposição</strong>: ${partes.join(' e ')}. <a href="#" id="show-restock">Mostrar apenas essas peças</a>`;
      alert.hidden = false;
      $('#show-restock').addEventListener('click', (event) => {
        event.preventDefault();
        filterSituacao.value = 'REPOSICAO';
        state.page = 1;
        loadProducts();
      });
    } else {
      alert.hidden = true;
    }

    const selected = filterCategoria.value;
    OT.fillSelect(filterCategoria, categorias, { value: (item) => item, label: (item) => item, placeholder: 'Todas', selected });
  }

  async function loadProducts() {
    rows.innerHTML = OT.loadingRow(COLUMNS);
    try {
      const payload = await OT.api(`/api/estoque/produtos${OT.query({
        q: search.value.trim(),
        categoria: filterCategoria.value,
        situacao: filterSituacao.value,
        ativo: filterAtivo.value,
        ordenar: state.sort,
        direcao: state.direction,
        page: state.page,
        limit: 20
      })}`);
      state.items = payload.produtos;
      state.page = payload.pagination.page;
      OT.renderPagination($('#pagination'), payload.pagination, (page) => { state.page = page; loadProducts(); });
      if (state.items.length === 0) {
        rows.innerHTML = OT.stateRow(COLUMNS, { title: 'Nenhuma peça encontrada', text: 'Ajuste a pesquisa ou os filtros para ver outras peças.' });
        return;
      }
      rows.innerHTML = state.items.map((peca) => {
        const active = OT.toBool(peca.ativo);
        const qtyClass = peca.situacao === 'SEM_ESTOQUE' ? 'neg' : peca.situacao === 'BAIXO' ? 'warn' : '';
        return `<tr class="${active ? '' : 'is-inactive'}">
          <td data-label="Código"><span class="code">${esc(peca.codigo)}</span></td>
          <td data-label="Produto"><span class="cell-main">${esc(peca.nome)}</span>${active ? '' : '<span class="cell-sub">Cadastro inativo</span>'}</td>
          <td data-label="Categoria">${esc(peca.categoria)}</td>
          <td data-label="Disponível" class="num"><span class="qty ${qtyClass}">${OT.number(peca.saldo_atual)} <small>${esc(peca.unidade)}</small></span></td>
          <td data-label="Mínimo" class="num">${OT.number(peca.estoque_minimo)}</td>
          <td data-label="Preço" class="num">${OT.money(peca.preco_atual)}<span class="cell-sub">custo ${OT.money(peca.preco_custo)}</span></td>
          <td data-label="Situação">${SITUACAO[peca.situacao] || esc(peca.situacao)}</td>
          <td class="actions">
            <button type="button" class="btn btn-ghost btn-sm" data-action="history" data-id="${peca.id_peca}">Histórico</button>
            <button type="button" class="btn btn-secondary btn-sm" data-action="edit" data-id="${peca.id_peca}">Editar</button>
            <button type="button" class="btn ${active ? 'btn-danger' : 'btn-secondary'} btn-sm" data-action="toggle" data-id="${peca.id_peca}">${active ? 'Inativar' : 'Ativar'}</button>
          </td>
        </tr>`;
      }).join('');
    } catch (error) {
      rows.innerHTML = OT.stateRow(COLUMNS, { iconName: 'alerta', title: 'Não foi possível carregar o estoque', text: error.message });
    }
  }

  async function reload() {
    await Promise.all([loadSummary(), loadProducts()]).catch((error) => OT.toast(error.message, 'error'));
  }

  async function openForm(peca) {
    state.editing = peca;
    form.reset();
    showFormError('');
    $('#form-title').textContent = peca ? 'Editar peça' : 'Nova peça';
    $('#form-submit').textContent = peca ? 'Salvar alterações' : 'Cadastrar peça';
    try {
      await OTPecaForm.prepare(form);
      if (peca) {
        const { peca: completa } = await OT.api(`/api/pecas/${peca.id_peca}`);
        OTPecaForm.fill(form, completa);
      }
    } catch (error) {
      OT.toast(error.message, 'error');
      return;
    }
    OT.openModal(formDialog);
    form.elements.codigo.focus();
  }

  async function toggle(peca) {
    const active = OT.toBool(peca.ativo);
    if (active) {
      const confirmed = await OT.confirmAction({
        title: 'Inativar peça',
        message: `${peca.nome} deixará de aceitar movimentações e de aparecer em novas ordens de serviço. O histórico é mantido.`,
        confirmLabel: 'Inativar',
        danger: true
      });
      if (!confirmed) return;
    }
    try {
      const payload = await OT.api(`/api/pecas/${peca.id_peca}/ativo`, { method: 'PATCH', body: { ativo: !active } });
      if (!payload.peca || OT.toBool(payload.peca.ativo) !== !active) throw new Error('O servidor não confirmou a alteração de situação.');
      OT.toast(payload.message);
    } catch (error) {
      OT.toast(error.message, 'error');
    }
    await reload();
  }

  async function openHistory(peca) {
    $('#history-title').textContent = `Movimentações: ${peca.nome}`;
    $('#history-summary').innerHTML = `Código <strong>${esc(peca.codigo)}</strong>. Saldo atual: <strong>${OT.number(peca.saldo_atual)} ${esc(peca.unidade)}</strong>; estoque mínimo: ${OT.number(peca.estoque_minimo)}.`;
    $('#history-all').href = `/movimentacoes.html?peca=${peca.id_peca}`;
    $('#history-new').href = `/movimentacoes.html?peca=${peca.id_peca}#nova`;
    $('#history-new').hidden = !OT.toBool(peca.ativo);
    const body = $('#history-rows');
    body.innerHTML = OT.loadingRow(5);
    OT.openModal(historyDialog);
    try {
      const { movimentos, pagination } = await OT.api(`/api/estoque/movimentos?id_peca=${peca.id_peca}&limit=8`);
      if (movimentos.length === 0) {
        body.innerHTML = OT.stateRow(5, { title: 'Nenhuma movimentação', text: 'Esta peça ainda não teve entradas, saídas ou ajustes.' });
        return;
      }
      body.innerHTML = movimentos.map((movimento) => `
        <tr>
          <td data-label="Data">${esc(OT.dateTime(movimento.criado_em))}</td>
          <td data-label="Tipo">${OTMovimento.badge(movimento.motivo)}</td>
          <td data-label="Quantidade" class="num">${OTMovimento.quantidade(movimento)}</td>
          <td data-label="Responsável">${esc(movimento.registrado_por_nome)}</td>
          <td data-label="Motivo">${esc(OTMovimento.motivo(movimento))}${movimento.id_os ? `<span class="cell-sub">OS ${esc(movimento.id_os)}</span>` : ''}</td>
        </tr>`).join('');
      if (pagination.total > movimentos.length) {
        $('#history-summary').innerHTML += ` Exibindo as ${movimentos.length} mais recentes de ${pagination.total}.`;
      }
    } catch (error) {
      body.innerHTML = OT.stateRow(5, { iconName: 'alerta', title: 'Histórico indisponível', text: error.message });
    }
  }

  rows.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const peca = state.items.find((item) => String(item.id_peca) === button.dataset.id);
    if (!peca) return;
    button.disabled = true;
    try {
      if (button.dataset.action === 'edit') await openForm(peca);
      else if (button.dataset.action === 'toggle') await toggle(peca);
      else await openHistory(peca);
    } finally {
      button.disabled = false;
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    showFormError('');
    let body;
    try {
      body = OTPecaForm.read(form);
    } catch (error) {
      showFormError(error.message);
      return;
    }
    const submit = $('#form-submit');
    submit.disabled = true;
    try {
      const editing = state.editing;
      await OT.api(editing ? `/api/pecas/${editing.id_peca}` : '/api/pecas', { method: editing ? 'PUT' : 'POST', body });
      OT.closeModal(formDialog);
      OT.toast(editing ? 'Alterações salvas.' : 'Peça cadastrada. Registre uma entrada para formar o saldo.');
      await reload();
    } catch (error) {
      showFormError(error.message);
    } finally {
      submit.disabled = false;
    }
  });

  for (const button of document.querySelectorAll('.sort-button')) {
    button.addEventListener('click', () => {
      const same = state.sort === button.dataset.sort;
      state.direction = same && state.direction === 'asc' ? 'desc' : 'asc';
      state.sort = button.dataset.sort;
      for (const other of document.querySelectorAll('.sort-button')) other.removeAttribute('aria-sort');
      button.setAttribute('aria-sort', state.direction === 'asc' ? 'ascending' : 'descending');
      state.page = 1;
      loadProducts();
    });
  }

  $('#new-button').addEventListener('click', () => openForm(null));
  search.addEventListener('input', OT.debounce(() => { state.page = 1; loadProducts(); }));
  for (const filter of [filterCategoria, filterSituacao, filterAtivo]) {
    filter.addEventListener('change', () => { state.page = 1; loadProducts(); });
  }

  await reload();
})();
