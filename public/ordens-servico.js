const form = document.querySelector('#ordem-form');
const messageBox = document.querySelector('#ordem-message');
const body = document.querySelector('#ordens-body');
const clientesSelect = document.querySelector('select[name="id_cliente"]');
const veiculosSelect = document.querySelector('select[name="id_veiculo"]');
const mecanicosSelect = document.querySelector('select[name="id_mecanico"]');
const logoutButton = document.querySelector('#logout-button');
const orderDetailSelect = document.querySelector('#ordem-detalhe-select');
const statusUpdateForm = document.querySelector('#status-update-form');
const statusUpdateSelect = document.querySelector('#status-update-select');
const statusHistoricoBody = document.querySelector('#status-historico-body');
const osServicosBody = document.querySelector('#os-servicos-body');
const osPecasBody = document.querySelector('#os-pecas-body');
const serviceItemForm = document.querySelector('#service-item-form');
const partItemForm = document.querySelector('#part-item-form');
const serviceCatalogSelect = document.querySelector('#id_servico');
const partCatalogSelect = document.querySelector('#id_peca');
const orderTotal = document.querySelector('#ordem-total');
const cancelServiceEditButton = document.querySelector('#cancel-service-edit');
const cancelPartEditButton = document.querySelector('#cancel-part-edit');
const currencyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

let selectedOrderId = null;
let editingServiceItemId = null;
let editingPartItemId = null;
let currentServices = [];
let currentParts = [];

function setMessage(text, type = '') {
  messageBox.textContent = text;
  messageBox.className = `message ${type}`.trim();
}

async function ensureAuthentication() {
  const response = await fetch('/api/auth/me', { credentials: 'same-origin' });
  if (!response.ok) {
    window.location.href = '/login.html';
    return false;
  }

  return true;
}

async function loadClientesSelect() {
  const response = await fetch('/api/clientes', { credentials: 'same-origin' });
  if (!response.ok) {
    throw new Error('Não foi possível carregar os clientes.');
  }

  const { clientes } = await response.json();
  clientesSelect.innerHTML = '<option value="">Selecione um cliente</option>' + clientes.map((cliente) => `<option value="${cliente.id_cliente}">${cliente.nome}</option>`).join('');
}

async function loadVeiculosSelect() {
  const response = await fetch('/api/veiculos', { credentials: 'same-origin' });
  if (!response.ok) {
    throw new Error('Não foi possível carregar os veículos.');
  }

  const { veiculos } = await response.json();
  veiculosSelect.innerHTML = '<option value="">Selecione um veículo</option>' + veiculos.map((veiculo) => `<option value="${veiculo.id_veiculo}">${veiculo.placa} - ${veiculo.marca} ${veiculo.modelo}</option>`).join('');
}

async function loadMecanicosSelect() {
  const response = await fetch('/api/mecanicos', { credentials: 'same-origin' });
  if (!response.ok) {
    throw new Error('Não foi possível carregar os mecânicos.');
  }

  const { mecanicos } = await response.json();
  mecanicosSelect.innerHTML = '<option value="">Sem mecânico definido</option>' + mecanicos.map((mecanico) => `<option value="${mecanico.id_mecanico}">${mecanico.nome_usuario}</option>`).join('');
}

const STATUS_OPTIONS = [
  ['1', 'Aberta'],
  ['2', 'Em diagnóstico'],
  ['3', 'Aguardando aprovação'],
  ['4', 'Aguardando peças'],
  ['5', 'Em execução'],
  ['6', 'Concluída'],
  ['7', 'Cancelada']
];

async function loadStatusSelect() {
  statusUpdateSelect.innerHTML = STATUS_OPTIONS.map(([value, label]) => `<option value="${value}">${label}</option>`).join('');
  statusUpdateSelect.value = '1';
}

async function loadOrdens() {
  try {
    const response = await fetch('/api/ordens-servico', { credentials: 'same-origin' });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({ error: 'Não foi possível carregar as ordens.' }));
      throw new Error(payload.error || 'Não foi possível carregar as ordens.');
    }

    const { ordens } = await response.json();
    if (!ordens.length) {
      body.innerHTML = '<tr><td colspan="4" class="empty-state">Nenhuma ordem cadastrada.</td></tr>';
      orderDetailSelect.innerHTML = '<option value="">Nenhuma ordem disponível</option>';
      osServicosBody.innerHTML = '<tr><td colspan="3" class="empty-state">Nenhum serviço adicionado.</td></tr>';
      osPecasBody.innerHTML = '<tr><td colspan="3" class="empty-state">Nenhuma peça adicionada.</td></tr>';
      return;
    }

    orderDetailSelect.innerHTML = ordens.map((ordem) => `<option value="${ordem.id_os}">OS ${ordem.id_os} - ${ordem.cliente_nome}</option>`).join('');

    if (!selectedOrderId || !ordens.some((ordem) => String(ordem.id_os) === String(selectedOrderId))) {
      selectedOrderId = String(ordens[0].id_os);
    }

    const selectedOrder = ordens.find((ordem) => String(ordem.id_os) === String(selectedOrderId));
    if (statusUpdateSelect && selectedOrder) {
      statusUpdateSelect.value = String(selectedOrder.id_status_os || STATUS_OPTIONS[0][0]);
    }

    orderDetailSelect.value = selectedOrderId;

    body.innerHTML = ordens.map((ordem) => `
      <tr>
        <td>${ordem.cliente_nome}</td>
        <td>${ordem.veiculo_placa}</td>
        <td>${ordem.status_nome}</td>
        <td>${currencyFormatter.format(Number(ordem.valor_total || 0))}</td>
      </tr>
    `).join('');

    await loadOrderDetails();
  } catch (error) {
    body.innerHTML = `<tr><td colspan="3" class="empty-state">${error.message}</td></tr>`;
  }
}

async function loadServiceCatalog() {
  const response = await fetch('/api/servicos', { credentials: 'same-origin' });
  if (!response.ok) {
    throw new Error('Não foi possível carregar os serviços.');
  }

  const { servicos } = await response.json();
  serviceCatalogSelect.innerHTML = '<option value="">Selecione um serviço</option>' + servicos.map((servico) => `
    <option value="${servico.id_servico}" data-valor="${servico.preco_atual}">${servico.nome}</option>
  `).join('');

  if (servicos.length) {
    serviceCatalogSelect.value = String(servicos[0].id_servico);
    serviceItemForm.querySelector('[name="valor_unitario"]').value = Number(servicos[0].preco_atual || 0).toFixed(2);
  }
}

async function loadPartCatalog() {
  const response = await fetch('/api/pecas', { credentials: 'same-origin' });
  if (!response.ok) {
    throw new Error('Não foi possível carregar as peças.');
  }

  const { pecas } = await response.json();
  partCatalogSelect.innerHTML = '<option value="">Selecione uma peça</option>' + pecas.map((peca) => `
    <option value="${peca.id_peca}" data-valor="${peca.preco_atual}">${peca.nome} (${peca.codigo})</option>
  `).join('');

  if (pecas.length) {
    partCatalogSelect.value = String(pecas[0].id_peca);
    partItemForm.querySelector('[name="valor_unitario"]').value = Number(pecas[0].preco_atual || 0).toFixed(2);
  }
}

async function loadOrderStatusHistory() {
  if (!selectedOrderId || !statusHistoricoBody) {
    return;
  }

  try {
    const response = await fetch(`/api/ordens-servico/${selectedOrderId}/historico-status`, { credentials: 'same-origin' });
    if (!response.ok) {
      throw new Error('Não foi possível carregar o histórico.');
    }

    const { historico = [] } = await response.json();
    if (!historico.length) {
      statusHistoricoBody.innerHTML = '<tr><td colspan="3" class="empty-state">Ainda não há histórico para esta ordem.</td></tr>';
      return;
    }

    statusHistoricoBody.innerHTML = historico.map((item) => `
      <tr>
        <td>${item.status_novo_nome || 'Status'}</td>
        <td>${item.alterado_por_nome || '-'}</td>
        <td>${item.alterado_em ? new Date(item.alterado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '-'}</td>
      </tr>
    `).join('');
  } catch {
    statusHistoricoBody.innerHTML = '<tr><td colspan="3" class="empty-state">Histórico indisponível.</td></tr>';
  }
}

async function loadOrderDetails() {
  if (!selectedOrderId) {
    if (orderTotal) {
      orderTotal.textContent = currencyFormatter.format(0);
    }
    osServicosBody.innerHTML = '<tr><td colspan="4" class="empty-state">Nenhum serviço adicionado.</td></tr>';
    osPecasBody.innerHTML = '<tr><td colspan="4" class="empty-state">Nenhuma peça adicionada.</td></tr>';
    statusHistoricoBody.innerHTML = '<tr><td colspan="3" class="empty-state">Nenhum histórico disponível.</td></tr>';
    return;
  }

  const orderPath = `/api/ordens-servico/${selectedOrderId}`;

  const [ordemResponse, servicoResponse, pecaResponse] = await Promise.all([
    fetch(orderPath, { credentials: 'same-origin' }),
    fetch(`${orderPath}/os-servicos`, { credentials: 'same-origin' }),
    fetch(`${orderPath}/os-pecas`, { credentials: 'same-origin' })
  ]);

  let ordemAtual = null;
  if (ordemResponse.ok) {
    const payload = await ordemResponse.json();
    ordemAtual = payload.ordem || null;
  }

  if (ordemAtual && statusUpdateSelect) {
    statusUpdateSelect.value = String(ordemAtual.id_status_os || STATUS_OPTIONS[0][0]);
  }
  if (orderTotal) {
    orderTotal.textContent = currencyFormatter.format(Number(ordemAtual?.valor_total || 0));
  }

  const servicosPayload = servicoResponse.ok ? await servicoResponse.json() : { itens: [] };
  const pecasPayload = pecaResponse.ok ? await pecaResponse.json() : { itens: [] };

  const servicos = servicosPayload.itens || [];
  currentServices = servicos;
  osServicosBody.innerHTML = servicos.length
    ? servicos.map((item) => `
        <tr>
          <td>${item.servico_nome}</td>
          <td>${item.quantidade}</td>
          <td>${currencyFormatter.format(Number(item.valor_unitario || 0))}</td>
          <td>
            <button type="button" data-item-action="edit-service" data-id="${item.id_os_servico}">Editar</button>
            <button type="button" data-item-action="remove-service" data-id="${item.id_os_servico}">Remover</button>
          </td>
        </tr>
      `).join('')
    : '<tr><td colspan="4" class="empty-state">Nenhum serviço adicionado.</td></tr>';

  const pecas = pecasPayload.itens || [];
  currentParts = pecas;
  osPecasBody.innerHTML = pecas.length
    ? pecas.map((item) => `
        <tr>
          <td>${item.peca_nome}</td>
          <td>${item.quantidade}</td>
          <td>${currencyFormatter.format(Number(item.valor_unitario || 0))}</td>
          <td>
            <button type="button" data-item-action="edit-part" data-id="${item.id_os_peca}">Editar</button>
            <button type="button" data-item-action="remove-part" data-id="${item.id_os_peca}">Remover</button>
          </td>
        </tr>
      `).join('')
    : '<tr><td colspan="4" class="empty-state">Nenhuma peça adicionada.</td></tr>';

  await loadOrderStatusHistory();
}

serviceCatalogSelect?.addEventListener('change', (event) => {
  const option = event.target.selectedOptions?.[0];
  if (!option) {
    return;
  }

  const valor = Number(option.dataset.valor || 0);
  serviceItemForm.querySelector('[name="valor_unitario"]').value = valor.toFixed(2);
});

partCatalogSelect?.addEventListener('change', (event) => {
  const option = event.target.selectedOptions?.[0];
  if (!option) {
    return;
  }

  const valor = Number(option.dataset.valor || 0);
  partItemForm.querySelector('[name="valor_unitario"]').value = valor.toFixed(2);
});

orderDetailSelect?.addEventListener('change', (event) => {
  selectedOrderId = String(event.target.value || '');
  if (selectedOrderId) {
    loadOrderDetails();
  }
});

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  setMessage('');

  const formData = new FormData(form);
  try {
    const payloadBody = {
      id_cliente: Number(formData.get('id_cliente')),
      id_veiculo: Number(formData.get('id_veiculo')),
      id_mecanico: formData.get('id_mecanico') ? Number(formData.get('id_mecanico')) : null,
      quilometragem_entrada: formData.get('quilometragem_entrada') ? Number(formData.get('quilometragem_entrada')) : null,
      diagnostico: formData.get('diagnostico') || null,
      observacoes: formData.get('observacoes') || null,
      previsao_conclusao: formData.get('previsao_conclusao') || null
    };

    const response = await fetch('/api/ordens-servico', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(payloadBody)
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || 'Não foi possível salvar a ordem.');
    }

    form.reset();
    setMessage('Ordem salva com sucesso.', 'success');
    await loadOrdens();
  } catch (error) {
    setMessage(error.message, 'error');
  }
});

statusUpdateForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!selectedOrderId) {
    return;
  }

  const formData = new FormData(statusUpdateForm);
  const payload = {
    id_status_os: Number(formData.get('id_status_os')),
    observacao: String(formData.get('observacao') || '').trim() || null
  };

  try {
    const response = await fetch(`/api/ordens-servico/${selectedOrderId}/status`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result.error || 'Não foi possível atualizar o status.');
    }

    statusUpdateForm.reset();
    if (statusUpdateSelect) {
      statusUpdateSelect.value = String(result.ordem?.id_status_os || STATUS_OPTIONS[0][0]);
    }
    await loadOrdens();
    setMessage('Status atualizado com sucesso.', 'success');
  } catch (error) {
    setMessage(error.message, 'error');
  }
});

serviceItemForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!selectedOrderId) {
    return;
  }

  const formData = new FormData(serviceItemForm);
  const wasEditing = editingServiceItemId !== null;
  const payload = {
    id_servico: Number(formData.get('id_servico')),
    descricao_snapshot: String(formData.get('descricao_snapshot') || '').trim(),
    quantidade: Number(formData.get('quantidade')),
    valor_unitario: Number(formData.get('valor_unitario'))
  };

  try {
    const path = `/api/ordens-servico/${selectedOrderId}/os-servicos`;
    const response = await fetch(wasEditing ? `${path}/${editingServiceItemId}` : path, {
      method: wasEditing ? 'PUT' : 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result.error || 'Não foi possível adicionar o serviço.');
    }

    resetServiceItemEditing();
    const serviceDefault = serviceCatalogSelect.selectedOptions?.[0];
    if (serviceDefault) {
      serviceItemForm.querySelector('[name="valor_unitario"]').value = Number(serviceDefault.dataset.valor || 0).toFixed(2);
    }
    await loadOrderDetails();
    setMessage(wasEditing ? 'Serviço atualizado.' : 'Serviço adicionado com sucesso.', 'success');
  } catch (error) {
    setMessage(error.message, 'error');
  }
});

partItemForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!selectedOrderId) {
    return;
  }

  const formData = new FormData(partItemForm);
  const wasEditing = editingPartItemId !== null;
  const payload = {
    id_peca: Number(formData.get('id_peca')),
    descricao_snapshot: String(formData.get('descricao_snapshot') || '').trim(),
    quantidade: Number(formData.get('quantidade')),
    valor_unitario: Number(formData.get('valor_unitario'))
  };

  try {
    const path = `/api/ordens-servico/${selectedOrderId}/os-pecas`;
    const response = await fetch(wasEditing ? `${path}/${editingPartItemId}` : path, {
      method: wasEditing ? 'PUT' : 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result.error || 'Não foi possível adicionar a peça.');
    }

    resetPartItemEditing();
    const partDefault = partCatalogSelect.selectedOptions?.[0];
    if (partDefault) {
      partItemForm.querySelector('[name="valor_unitario"]').value = Number(partDefault.dataset.valor || 0).toFixed(2);
    }
    await loadOrderDetails();
    setMessage(wasEditing ? 'Peça atualizada.' : 'Peça adicionada com sucesso.', 'success');
  } catch (error) {
    setMessage(error.message, 'error');
  }
});

function resetServiceItemEditing() {
  editingServiceItemId = null;
  serviceCatalogSelect.disabled = false;
  cancelServiceEditButton.hidden = true;
  serviceItemForm.querySelector('[type="submit"]').textContent = 'Adicionar serviço';
  serviceItemForm.reset();
}

function resetPartItemEditing() {
  editingPartItemId = null;
  partCatalogSelect.disabled = false;
  cancelPartEditButton.hidden = true;
  partItemForm.querySelector('[type="submit"]').textContent = 'Adicionar peça';
  partItemForm.reset();
}

osServicosBody?.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-item-action]');
  if (!button || !selectedOrderId) return;
  const item = currentServices.find((service) => String(service.id_os_servico) === button.dataset.id);
  if (!item) return;
  if (button.dataset.itemAction === 'edit-service') {
    editingServiceItemId = button.dataset.id;
    serviceCatalogSelect.value = String(item.id_servico);
    serviceCatalogSelect.disabled = true;
    serviceItemForm.elements.descricao_snapshot.value = item.descricao_snapshot;
    serviceItemForm.elements.quantidade.value = item.quantidade;
    serviceItemForm.elements.valor_unitario.value = Number(item.valor_unitario).toFixed(2);
    serviceItemForm.querySelector('[type="submit"]').textContent = 'Salvar serviço';
    cancelServiceEditButton.hidden = false;
    return;
  }
  if (!window.confirm('Remover este serviço da ordem?')) return;
  try {
    const response = await fetch(`/api/ordens-servico/${selectedOrderId}/os-servicos/${item.id_os_servico}`, {
      method: 'DELETE', credentials: 'same-origin'
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Não foi possível remover o serviço.');
    await loadOrderDetails();
    setMessage('Serviço removido da ordem.', 'success');
  } catch (error) {
    setMessage(error.message, 'error');
  }
});

osPecasBody?.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-item-action]');
  if (!button || !selectedOrderId) return;
  const item = currentParts.find((part) => String(part.id_os_peca) === button.dataset.id);
  if (!item) return;
  if (button.dataset.itemAction === 'edit-part') {
    editingPartItemId = button.dataset.id;
    partCatalogSelect.value = String(item.id_peca);
    partCatalogSelect.disabled = true;
    partItemForm.elements.descricao_snapshot.value = item.descricao_snapshot;
    partItemForm.elements.quantidade.value = item.quantidade;
    partItemForm.elements.valor_unitario.value = Number(item.valor_unitario).toFixed(2);
    partItemForm.querySelector('[type="submit"]').textContent = 'Salvar peça';
    cancelPartEditButton.hidden = false;
    return;
  }
  if (!window.confirm('Remover esta peça e estornar o estoque?')) return;
  try {
    const response = await fetch(`/api/ordens-servico/${selectedOrderId}/os-pecas/${item.id_os_peca}`, {
      method: 'DELETE', credentials: 'same-origin'
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Não foi possível remover a peça.');
    await loadOrderDetails();
    setMessage('Peça removida; estoque estornado.', 'success');
  } catch (error) {
    setMessage(error.message, 'error');
  }
});

cancelServiceEditButton?.addEventListener('click', resetServiceItemEditing);
cancelPartEditButton?.addEventListener('click', resetPartItemEditing);

logoutButton?.addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
  window.location.href = '/login.html';
});

(async () => {
  const isLoggedIn = await ensureAuthentication();
  if (isLoggedIn) {
    await loadClientesSelect();
    await loadVeiculosSelect();
    await loadMecanicosSelect();
    await loadStatusSelect();
    await loadServiceCatalog();
    await loadPartCatalog();
    await loadOrdens();
  }
})();
