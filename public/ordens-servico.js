(async () => {
  const { esc } = OT;
  if (!await OT.initPage('ordens')) return;

  const $ = (selector) => document.querySelector(selector);
  const listView = $('#list-view');
  const detailView = $('#detail-view');
  const rows = $('#rows');
  const search = $('#search');
  const filterStatus = $('#filter-status');
  const filterMecanico = $('#filter-mecanico');
  const orderDialog = $('#order-dialog');
  const orderForm = $('#order-form');
  const assignDialog = $('#assign-dialog');
  const assignForm = $('#assign-form');
  const serviceForm = $('#service-form');
  const partForm = $('#part-form');
  const statusForm = $('#status-form');
  const PAGE_SIZE = 12;
  const CLOSED = ['CONCLUIDA', 'CANCELADA'];
  const state = {
    page: 1,
    orders: [],
    statusCatalog: [],
    mechanics: [],
    services: [],
    parts: [],
    order: null,
    serviceItems: [],
    partItems: [],
    editingService: null,
    editingPart: null
  };

  const showError = (element, message) => {
    element.textContent = message || '';
    element.hidden = !message;
  };
  const mechanicLabel = (mecanico) => {
    const carga = mecanico.ordens_em_andamento === 1 ? '1 ordem em andamento' : `${mecanico.ordens_em_andamento} ordens em andamento`;
    return `${mecanico.nome} — ${mecanico.especialidade || 'sem especialidade'} (${carga})`;
  };

  // ---- Catálogos (todos os registros ativos, sem o limite de página das telas de cadastro) ----
  async function loadMechanics() {
    state.mechanics = (await OT.api('/api/mecanicos/opcoes')).mecanicos;
    const selected = filterMecanico.value;
    filterMecanico.innerHTML = '<option value="">Todos</option><option value="nenhum">Sem responsável</option>'
      + state.mechanics.map((mecanico) => `<option value="${mecanico.id_mecanico}">${esc(mecanico.nome)}</option>`).join('');
    filterMecanico.value = selected;
  }

  async function loadCatalogs() {
    const [status, services, parts] = await Promise.all([
      OT.api('/api/ordens-servico/status'),
      OT.api('/api/servicos/opcoes'),
      OT.api('/api/pecas/opcoes'),
      loadMechanics()
    ]);
    state.statusCatalog = status.status;
    state.services = services.servicos;
    state.parts = parts.pecas;
    OT.fillSelect(filterStatus, state.statusCatalog, { value: (item) => item.codigo, label: (item) => item.nome, placeholder: 'Todos' });
  }

  // ---- Lista ----------------------------------------------------------------------------------
  async function loadOrders() {
    rows.innerHTML = OT.loadingRow(7);
    try {
      const payload = await OT.api(`/api/ordens-servico${OT.query({ q: search.value.trim(), status: filterStatus.value, id_mecanico: filterMecanico.value })}`);
      state.orders = payload.ordens;
      renderOrders();
    } catch (error) {
      rows.innerHTML = OT.stateRow(7, { iconName: 'alerta', title: 'Não foi possível carregar as ordens', text: error.message });
    }
  }

  function renderOrders() {
    const total = state.orders.length;
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    state.page = Math.min(state.page, pages);
    OT.renderPagination($('#pagination'), { page: state.page, limit: PAGE_SIZE, total, pages }, (page) => { state.page = page; renderOrders(); });
    if (total === 0) {
      rows.innerHTML = OT.stateRow(7, { title: 'Nenhuma ordem encontrada', text: 'Ajuste a pesquisa e os filtros ou abra uma nova ordem de serviço.' });
      return;
    }
    const slice = state.orders.slice((state.page - 1) * PAGE_SIZE, state.page * PAGE_SIZE);
    rows.innerHTML = slice.map((ordem) => `
      <tr>
        <td data-label="Ordem"><a class="os-tag" href="#os-${ordem.id_os}">OS ${ordem.id_os}</a><span class="cell-sub">${esc(OT.date(ordem.aberta_em))}</span></td>
        <td data-label="Cliente">${esc(ordem.cliente_nome)}</td>
        <td data-label="Veículo">${OT.plate(ordem.veiculo_placa)}<span class="cell-sub">${esc(`${ordem.veiculo_marca} ${ordem.veiculo_modelo}`)}</span></td>
        <td data-label="Responsável">${ordem.mecanico_nome ? esc(ordem.mecanico_nome) : '<span class="muted">Sem responsável</span>'}</td>
        <td data-label="Status">${OT.statusBadge(ordem.status_codigo, ordem.status_nome)}</td>
        <td data-label="Total" class="num">${OT.money(ordem.valor_total)}</td>
        <td class="actions"><a class="btn btn-secondary btn-sm" href="#os-${ordem.id_os}">Abrir</a></td>
      </tr>`).join('');
  }

  // ---- Nova ordem -----------------------------------------------------------------------------
  async function loadVehiclesFor(idCliente) {
    const select = orderForm.elements.id_veiculo;
    const hint = $('#o-veiculo-hint');
    if (!idCliente) {
      select.innerHTML = '<option value="">Selecione primeiro o cliente</option>';
      select.disabled = true;
      hint.textContent = 'Aparecem apenas os veículos do cliente escolhido.';
      return;
    }
    select.disabled = true;
    select.innerHTML = '<option value="">Carregando veículos…</option>';
    const { veiculos } = await OT.api(`/api/veiculos/opcoes?id_cliente=${idCliente}`);
    if (veiculos.length === 0) {
      select.innerHTML = '<option value="">Cliente sem veículo ativo</option>';
      hint.innerHTML = 'Este cliente não tem veículo ativo. <a href="/veiculos.html">Cadastre um veículo</a> antes de abrir a ordem.';
      return;
    }
    OT.fillSelect(select, veiculos, {
      value: (veiculo) => veiculo.id_veiculo,
      label: (veiculo) => `${veiculo.placa} — ${veiculo.marca} ${veiculo.modelo}${veiculo.ano ? ` ${veiculo.ano}` : ''}`,
      placeholder: veiculos.length === 1 ? undefined : 'Selecione o veículo'
    });
    select.disabled = false;
    hint.textContent = veiculos.length === 1 ? 'Único veículo ativo deste cliente.' : `${veiculos.length} veículos ativos deste cliente.`;
  }

  async function openOrderForm() {
    orderForm.reset();
    showError($('#order-error'), '');
    try {
      const [{ clientes }] = await Promise.all([OT.api('/api/clientes/opcoes'), loadMechanics()]);
      OT.fillSelect(orderForm.elements.id_cliente, clientes, { value: (cliente) => cliente.id_cliente, label: (cliente) => cliente.nome, placeholder: 'Selecione o cliente' });
      OT.fillSelect(orderForm.elements.id_mecanico, state.mechanics, { value: (mecanico) => mecanico.id_mecanico, label: mechanicLabel, placeholder: 'Definir depois' });
      await loadVehiclesFor(null);
    } catch (error) {
      OT.toast(error.message, 'error');
      return;
    }
    OT.openModal(orderDialog);
    orderForm.elements.id_cliente.focus();
  }

  orderForm.elements.id_cliente.addEventListener('change', async (event) => {
    try {
      await loadVehiclesFor(event.target.value);
    } catch (error) {
      showError($('#order-error'), error.message);
    }
  });

  orderForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const error = $('#order-error');
    showError(error, '');
    const data = Object.fromEntries(new FormData(orderForm));
    if (!data.id_cliente) return showError(error, 'Selecione o cliente.');
    if (!data.id_veiculo) return showError(error, 'Selecione um veículo do cliente.');
    const submit = $('#order-submit');
    submit.disabled = true;
    try {
      const payload = await OT.api('/api/ordens-servico', {
        method: 'POST',
        body: {
          id_cliente: Number(data.id_cliente),
          id_veiculo: Number(data.id_veiculo),
          id_mecanico: data.id_mecanico ? Number(data.id_mecanico) : null,
          quilometragem_entrada: data.quilometragem_entrada ? Number(data.quilometragem_entrada) : null,
          previsao_conclusao: data.previsao_conclusao || null,
          diagnostico: data.diagnostico || null,
          observacoes: data.observacoes || null
        }
      });
      OT.closeModal(orderDialog);
      OT.toast(`OS ${payload.ordem.id_os} aberta${payload.ordem.mecanico_nome ? ` e atribuída a ${payload.ordem.mecanico_nome}` : ''}.`);
      window.location.hash = `os-${payload.ordem.id_os}`;
    } catch (caught) {
      showError(error, caught.message);
    } finally {
      submit.disabled = false;
    }
    return undefined;
  });

  // ---- Detalhe --------------------------------------------------------------------------------
  function itemRows(items, { idKey, emptyText, closed, type }) {
    if (items.length === 0) {
      return `<tr><td class="state" colspan="5"><p>${emptyText}</p></td></tr>`;
    }
    return items.map((item) => `
      <tr>
        <td data-label="${type === 'service' ? 'Serviço' : 'Peça'}"><span class="cell-main">${esc(item.descricao_snapshot)}</span>${type === 'part' ? `<span class="cell-sub code">${esc(item.peca_codigo)}</span>` : ''}</td>
        <td data-label="Qtd." class="num">${OT.number(item.quantidade)}</td>
        <td data-label="Valor unitário" class="num">${OT.money(item.valor_unitario)}</td>
        <td data-label="Subtotal" class="num">${OT.money(Number(item.quantidade) * Number(item.valor_unitario))}</td>
        <td class="actions">${closed ? '' : `
          <button type="button" class="btn btn-secondary btn-sm" data-item="${type}" data-action="edit" data-id="${item[idKey]}">Editar</button>
          <button type="button" class="btn btn-danger btn-sm" data-item="${type}" data-action="remove" data-id="${item[idKey]}">Remover</button>`}</td>
      </tr>`).join('');
  }

  function renderHistory(historico) {
    $('#history-list').innerHTML = historico.length
      ? historico.map((item) => {
        const responsavel = item.tipo === 'RESPONSAVEL';
        const titulo = responsavel
          ? esc(item.observacao || 'Responsável alterado.')
          : (item.id_status_anterior === null ? 'Ordem aberta' : `Status: ${esc(item.status_anterior_nome)} → ${esc(item.status_novo_nome)}`);
        const nota = !responsavel && item.observacao ? `<span class="note">${esc(item.observacao)}</span>` : '';
        return `<li class="${responsavel ? 'is-person' : ''}"><strong>${titulo}</strong><span class="when">${esc(OT.dateTime(item.alterado_em))}, por ${esc(item.alterado_por_nome)}</span>${nota}</li>`;
      }).join('')
      : '<li><span class="muted">Esta ordem ainda não tem registros de histórico.</span></li>';
  }

  function resetServiceForm() {
    state.editingService = null;
    serviceForm.reset();
    serviceForm.elements.id_servico.disabled = false;
    $('#service-form-title').textContent = 'Adicionar serviço';
    $('#service-submit').textContent = 'Adicionar serviço';
    $('#service-cancel').hidden = true;
  }

  function resetPartForm() {
    state.editingPart = null;
    partForm.reset();
    partForm.elements.id_peca.disabled = false;
    $('#part-form-title').textContent = 'Adicionar peça';
    $('#part-submit').textContent = 'Adicionar peça';
    $('#part-cancel').hidden = true;
  }

  async function loadItems() {
    const id = state.order.id_os;
    const [ordem, servicos, pecas, catalogo] = await Promise.all([
      OT.api(`/api/ordens-servico/${id}`),
      OT.api(`/api/ordens-servico/${id}/os-servicos`),
      OT.api(`/api/ordens-servico/${id}/os-pecas`),
      OT.api('/api/pecas/opcoes')
    ]);
    state.order = ordem.ordem;
    state.transitions = ordem.transicoes;
    state.serviceItems = servicos.itens;
    state.partItems = pecas.itens;
    state.parts = catalogo.pecas;
    const closed = CLOSED.includes(state.order.status_codigo);
    $('#service-rows').innerHTML = itemRows(state.serviceItems, { idKey: 'id_os_servico', emptyText: 'Nenhum serviço adicionado.', closed, type: 'service' });
    $('#part-rows').innerHTML = itemRows(state.partItems, { idKey: 'id_os_peca', emptyText: 'Nenhuma peça adicionada.', closed, type: 'part' });
    $('#detail-total').textContent = OT.money(state.order.valor_total);
    OT.fillSelect(partForm.elements.id_peca, state.parts, {
      value: (peca) => peca.id_peca,
      label: (peca) => `${peca.nome} (${peca.codigo}) — saldo ${Number(peca.saldo_atual)} ${peca.unidade}`,
      placeholder: 'Selecione a peça'
    });
  }

  function renderOrder() {
    const ordem = state.order;
    const closed = CLOSED.includes(ordem.status_codigo);
    $('#detail-title').textContent = `OS ${ordem.id_os}`;
    $('#detail-status').innerHTML = OT.statusBadge(ordem.status_codigo, ordem.status_nome);
    $('#detail-subtitle').textContent = `Aberta por ${ordem.aberta_por_nome}.`;
    $('#d-cliente').textContent = ordem.cliente_nome;
    $('#d-veiculo').innerHTML = `<span class="vehicle-line">${OT.plate(ordem.veiculo_placa)}<span>${esc(`${ordem.veiculo_marca} ${ordem.veiculo_modelo}`)}</span></span>`;
    $('#d-km').textContent = ordem.quilometragem_entrada === null ? '—' : `${OT.number(ordem.quilometragem_entrada)} km`;
    $('#d-previsao').textContent = OT.dateTime(ordem.previsao_conclusao, 'Sem previsão');
    $('#d-mecanico').innerHTML = ordem.mecanico_nome ? esc(ordem.mecanico_nome) : '<span class="badge warn">Sem responsável</span>';
    $('#assign-button').textContent = ordem.mecanico_nome ? 'Alterar responsável' : 'Definir responsável';
    $('#assign-button').hidden = closed;
    $('#d-abertura').textContent = OT.dateTime(ordem.aberta_em);
    $('#d-conclusao').textContent = OT.dateTime(ordem.concluida_em, '—');
    $('#d-diagnostico').textContent = ordem.diagnostico || 'Não informado';
    $('#d-observacoes').textContent = ordem.observacoes || 'Nenhuma';

    serviceForm.hidden = closed;
    partForm.hidden = closed;
    statusForm.hidden = closed || state.transitions.length === 0;
    $('#closed-note').hidden = !closed;
    OT.fillSelect(statusForm.elements.id_status_os, state.transitions, { value: (item) => item.id_status_os, label: (item) => item.nome });
  }

  async function openDetail(id) {
    listView.hidden = true;
    detailView.hidden = false;
    window.scrollTo(0, 0);
    state.order = { id_os: id };
    resetServiceForm();
    resetPartForm();
    statusForm.reset();
    OT.fillSelect(serviceForm.elements.id_servico, state.services, { value: (servico) => servico.id_servico, label: (servico) => servico.nome, placeholder: 'Selecione o serviço' });
    try {
      await loadItems();
      renderOrder();
      renderHistory((await OT.api(`/api/ordens-servico/${id}/historico-status`)).historico);
    } catch (error) {
      OT.toast(error.message, 'error');
      window.location.hash = '';
    }
  }

  async function refreshDetail() {
    await loadItems();
    renderOrder();
    renderHistory((await OT.api(`/api/ordens-servico/${state.order.id_os}/historico-status`)).historico);
  }

  async function route() {
    const match = window.location.hash.match(/^#os-(\d+)$/);
    if (match) {
      await openDetail(Number(match[1]));
      return;
    }
    detailView.hidden = true;
    listView.hidden = false;
    state.order = null;
    await loadOrders();
    if (window.location.hash === '#nova') {
      window.history.replaceState(null, '', window.location.pathname);
      await openOrderForm();
    }
  }

  // ---- Responsável ----------------------------------------------------------------------------
  $('#assign-button').addEventListener('click', async () => {
    showError($('#assign-error'), '');
    assignForm.reset();
    try {
      await loadMechanics();
    } catch (error) {
      OT.toast(error.message, 'error');
      return;
    }
    const ordem = state.order;
    $('#assign-current').innerHTML = ordem.mecanico_nome
      ? `A OS ${ordem.id_os} está com <strong>${esc(ordem.mecanico_nome)}</strong>.`
      : `A OS ${ordem.id_os} ainda não tem responsável.`;
    const opcoes = state.mechanics.filter((mecanico) => mecanico.id_mecanico !== ordem.id_mecanico);
    const select = assignForm.elements.id_mecanico;
    select.innerHTML = '<option value="">Selecione o mecânico</option>'
      + opcoes.map((mecanico) => `<option value="${mecanico.id_mecanico}">${esc(mechanicLabel(mecanico))}</option>`).join('')
      + (ordem.id_mecanico ? '<option value="nenhum">Deixar sem responsável</option>' : '');
    OT.openModal(assignDialog);
    select.focus();
  });

  assignForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const error = $('#assign-error');
    showError(error, '');
    const value = assignForm.elements.id_mecanico.value;
    if (!value) return showError(error, 'Selecione o novo responsável.');
    const submit = $('#assign-submit');
    submit.disabled = true;
    try {
      const payload = await OT.api(`/api/ordens-servico/${state.order.id_os}/mecanico`, {
        method: 'PATCH',
        body: { id_mecanico: value === 'nenhum' ? null : Number(value), observacao: assignForm.elements.observacao.value.trim() }
      });
      OT.closeModal(assignDialog);
      OT.toast(payload.message);
      await refreshDetail();
    } catch (caught) {
      showError(error, caught.message);
    } finally {
      submit.disabled = false;
    }
    return undefined;
  });

  // ---- Status ---------------------------------------------------------------------------------
  statusForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const target = state.transitions.find((item) => String(item.id_status_os) === statusForm.elements.id_status_os.value);
    if (!target) return;
    if (target.codigo === 'CANCELADA') {
      const confirmed = await OT.confirmAction({
        title: 'Cancelar ordem de serviço',
        message: `A OS ${state.order.id_os} será encerrada e as peças lançadas voltarão ao estoque. Esta ação não pode ser desfeita.`,
        confirmLabel: 'Cancelar a ordem',
        danger: true
      });
      if (!confirmed) return;
    }
    try {
      await OT.api(`/api/ordens-servico/${state.order.id_os}/status`, {
        method: 'POST',
        body: { id_status_os: target.id_status_os, observacao: statusForm.elements.observacao.value.trim() || null }
      });
      statusForm.reset();
      OT.toast(`Status atualizado para ${target.nome}.`);
      await refreshDetail();
    } catch (error) {
      OT.toast(error.message, 'error');
    }
  });

  // ---- Serviços e peças da ordem --------------------------------------------------------------
  serviceForm.elements.id_servico.addEventListener('change', (event) => {
    const servico = state.services.find((item) => String(item.id_servico) === event.target.value);
    if (!servico) return;
    serviceForm.elements.descricao_snapshot.value = servico.nome;
    serviceForm.elements.valor_unitario.value = Number(servico.preco_atual).toFixed(2);
  });

  partForm.elements.id_peca.addEventListener('change', (event) => {
    const peca = state.parts.find((item) => String(item.id_peca) === event.target.value);
    if (!peca) return;
    partForm.elements.descricao_snapshot.value = peca.nome;
    partForm.elements.valor_unitario.value = Number(peca.preco_atual).toFixed(2);
  });

  async function submitItem({ form, editing, path, idField, catalogField, label, reset }) {
    const data = Object.fromEntries(new FormData(form));
    const body = {
      descricao_snapshot: (data.descricao_snapshot || '').trim(),
      quantidade: Number(data.quantidade),
      valor_unitario: Number(data.valor_unitario)
    };
    if (!editing) body[catalogField] = Number(data[catalogField]);
    if (!editing && !body[catalogField]) return OT.toast(`Selecione ${label}.`, 'error');
    try {
      await OT.api(`/api/ordens-servico/${state.order.id_os}/${path}${editing ? `/${editing[idField]}` : ''}`, { method: editing ? 'PUT' : 'POST', body });
      reset();
      OT.toast(editing ? 'Item atualizado.' : 'Item adicionado à ordem.');
      await refreshDetail();
    } catch (error) {
      OT.toast(error.message, 'error');
    }
    return undefined;
  }

  serviceForm.addEventListener('submit', (event) => {
    event.preventDefault();
    submitItem({ form: serviceForm, editing: state.editingService, path: 'os-servicos', idField: 'id_os_servico', catalogField: 'id_servico', label: 'o serviço', reset: resetServiceForm });
  });
  partForm.addEventListener('submit', (event) => {
    event.preventDefault();
    submitItem({ form: partForm, editing: state.editingPart, path: 'os-pecas', idField: 'id_os_peca', catalogField: 'id_peca', label: 'a peça', reset: resetPartForm });
  });
  $('#service-cancel').addEventListener('click', resetServiceForm);
  $('#part-cancel').addEventListener('click', resetPartForm);

  detailView.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-item]');
    if (!button) return;
    const isService = button.dataset.item === 'service';
    const items = isService ? state.serviceItems : state.partItems;
    const idField = isService ? 'id_os_servico' : 'id_os_peca';
    const item = items.find((entry) => String(entry[idField]) === button.dataset.id);
    if (!item) return;
    const form = isService ? serviceForm : partForm;
    const catalogField = isService ? 'id_servico' : 'id_peca';

    if (button.dataset.action === 'edit') {
      if (isService) state.editingService = item; else state.editingPart = item;
      const select = form.elements[catalogField];
      if (![...select.options].some((option) => option.value === String(item[catalogField]))) {
        select.insertAdjacentHTML('beforeend', `<option value="${item[catalogField]}">${esc(item.descricao_snapshot)}</option>`);
      }
      select.value = String(item[catalogField]);
      select.disabled = true;
      form.elements.descricao_snapshot.value = item.descricao_snapshot;
      form.elements.quantidade.value = Number(item.quantidade);
      form.elements.valor_unitario.value = Number(item.valor_unitario).toFixed(2);
      $(isService ? '#service-form-title' : '#part-form-title').textContent = isService ? 'Editar serviço da ordem' : 'Editar peça da ordem';
      $(isService ? '#service-submit' : '#part-submit').textContent = 'Salvar alterações';
      $(isService ? '#service-cancel' : '#part-cancel').hidden = false;
      form.elements.quantidade.focus();
      return;
    }

    const confirmed = await OT.confirmAction({
      title: isService ? 'Remover serviço' : 'Remover peça',
      message: isService
        ? `"${item.descricao_snapshot}" será removido desta ordem.`
        : `"${item.descricao_snapshot}" será removida desta ordem e ${Number(item.quantidade)} unidade(s) voltarão ao estoque.`,
      confirmLabel: 'Remover',
      danger: true
    });
    if (!confirmed) return;
    try {
      await OT.api(`/api/ordens-servico/${state.order.id_os}/${isService ? 'os-servicos' : 'os-pecas'}/${item[idField]}`, { method: 'DELETE' });
      OT.toast(isService ? 'Serviço removido da ordem.' : 'Peça removida; quantidade devolvida ao estoque.');
      if (isService) resetServiceForm(); else resetPartForm();
      await refreshDetail();
    } catch (error) {
      OT.toast(error.message, 'error');
    }
  });

  // ---- Eventos gerais -------------------------------------------------------------------------
  $('#new-button').addEventListener('click', openOrderForm);
  $('#back-button').addEventListener('click', (event) => {
    event.preventDefault();
    window.location.hash = '';
  });
  search.addEventListener('input', OT.debounce(() => { state.page = 1; loadOrders(); }));
  for (const filter of [filterStatus, filterMecanico]) filter.addEventListener('change', () => { state.page = 1; loadOrders(); });
  window.addEventListener('hashchange', route);

  try {
    await loadCatalogs();
  } catch (error) {
    OT.toast(error.message, 'error');
  }
  await route();
})();
