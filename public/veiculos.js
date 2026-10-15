const form = document.querySelector('#veiculo-form');
const messageBox = document.querySelector('#veiculo-message');
const body = document.querySelector('#veiculos-body');
const select = document.querySelector('select[name="id_cliente"]');
const logoutButton = document.querySelector('#logout-button');
const searchInput = document.querySelector('#vehicle-search');
const title = document.querySelector('#cadastro-title');
const submitButton = form?.querySelector('[type="submit"]');
const cancelEditButton = document.querySelector('#cancel-edit');
const activeFilter = document.querySelector('#vehicle-active-filter');
const pageLabel = document.querySelector('#vehicles-page');
const previousButton = document.querySelector('#vehicles-previous');
const nextButton = document.querySelector('#vehicles-next');
const pageSize = 10;
let editingVehicleId = null;
let currentPage = 1;
let totalPages = 1;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

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
  const options = clientes.map((cliente) => `<option value="${cliente.id_cliente}">${cliente.nome}</option>`).join('');
  select.innerHTML = `<option value="">Selecione um cliente</option>${options}`;
}

async function loadVeiculos() {
  try {
    const query = searchInput?.value.trim() || '';
    const active = activeFilter?.value || '';
    const response = await fetch(`/api/veiculos?q=${encodeURIComponent(query)}&ativo=${active}&page=${currentPage}&limit=${pageSize}`, { credentials: 'same-origin' });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({ error: 'Não foi possível carregar os veículos.' }));
      throw new Error(payload.error || 'Não foi possível carregar os veículos.');
    }

    const { veiculos, pagination } = await response.json();
    currentPage = pagination.page;
    totalPages = Math.max(1, pagination.pages);
    updatePagination();
    if (!veiculos.length) {
      body.innerHTML = '<tr><td colspan="5" class="empty-state">Nenhum veículo encontrado.</td></tr>';
      return;
    }

    body.innerHTML = veiculos.map((veiculo) => `
      <tr>
        <td>${escapeHtml(veiculo.cliente_nome)}</td>
        <td>${escapeHtml(`${veiculo.marca} ${veiculo.modelo}`)}</td>
        <td>${escapeHtml(veiculo.placa)}</td>
        <td>${veiculo.ativo ? 'Ativo' : 'Inativo'}</td>
        <td>
          <button type="button" data-action="edit" data-id="${veiculo.id_veiculo}">Editar</button>
          <button type="button" data-action="toggle" data-id="${veiculo.id_veiculo}" data-active="${veiculo.ativo}">${veiculo.ativo ? 'Arquivar' : 'Reativar'}</button>
        </td>
      </tr>
    `).join('');
  } catch (error) {
    body.innerHTML = `<tr><td colspan="5" class="empty-state">${escapeHtml(error.message)}</td></tr>`;
  }
}

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  setMessage('');

  const formData = new FormData(form);
  const wasEditing = Boolean(editingVehicleId);
  try {
    const response = await fetch(editingVehicleId ? `/api/veiculos/${editingVehicleId}` : '/api/veiculos', {
      method: editingVehicleId ? 'PUT' : 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        id_cliente: Number(formData.get('id_cliente')),
        placa: formData.get('placa'),
        chassi: formData.get('chassi'),
        marca: formData.get('marca'),
        modelo: formData.get('modelo'),
        ano: Number(formData.get('ano')) || null,
        cor: formData.get('cor')
      })
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || 'Não foi possível salvar o veículo.');
    }

    form.reset();
    resetEditing();
    setMessage(wasEditing ? 'Veículo atualizado com sucesso.' : 'Veículo salvo com sucesso.', 'success');
    await loadVeiculos();
  } catch (error) {
    setMessage(error.message, 'error');
  }
});

function resetEditing() {
  editingVehicleId = null;
  title.textContent = 'Novo veículo';
  submitButton.textContent = 'Salvar veículo';
  cancelEditButton.hidden = true;
  form.reset();
}

function updatePagination() {
  pageLabel.textContent = `Página ${currentPage} de ${totalPages}`;
  previousButton.disabled = currentPage <= 1;
  nextButton.disabled = currentPage >= totalPages;
}

body?.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) {
    return;
  }

  const id = button.dataset.id;
  try {
    if (button.dataset.action === 'edit') {
      const response = await fetch(`/api/veiculos/${id}`, { credentials: 'same-origin' });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Não foi possível carregar o veículo.');
      }
      editingVehicleId = id;
      for (const field of ['id_cliente', 'placa', 'chassi', 'marca', 'modelo', 'ano', 'cor']) {
        form.elements[field].value = payload.veiculo[field] ?? '';
      }
      title.textContent = 'Editar veículo';
      submitButton.textContent = 'Salvar alterações';
      cancelEditButton.hidden = false;
      form.elements.placa.focus();
      return;
    }

    const ativo = button.dataset.active !== 'true';
    const response = await fetch(`/api/veiculos/${id}/ativo`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ ativo })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || 'Não foi possível atualizar a situação.');
    }
    setMessage(ativo ? 'Veículo reativado.' : 'Veículo arquivado.', 'success');
    await loadVeiculos();
  } catch (error) {
    setMessage(error.message, 'error');
  }
});

cancelEditButton?.addEventListener('click', resetEditing);
searchInput?.addEventListener('input', () => { currentPage = 1; loadVeiculos(); });
activeFilter?.addEventListener('change', () => { currentPage = 1; loadVeiculos(); });
previousButton?.addEventListener('click', () => { currentPage -= 1; loadVeiculos(); });
nextButton?.addEventListener('click', () => { currentPage += 1; loadVeiculos(); });

logoutButton?.addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
  window.location.href = '/login.html';
});

(async () => {
  const isLoggedIn = await ensureAuthentication();
  if (isLoggedIn) {
    await loadClientesSelect();
    await loadVeiculos();
  }
})();
