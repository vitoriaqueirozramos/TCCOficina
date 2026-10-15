const form = document.querySelector('#cliente-form');
const messageBox = document.querySelector('#cliente-message');
const body = document.querySelector('#clientes-body');
const logoutButton = document.querySelector('#logout-button');
const searchInput = document.querySelector('#cliente-search');
const title = document.querySelector('#cadastro-title');
const submitButton = form?.querySelector('[type="submit"]');
const cancelEditButton = document.querySelector('#cancel-edit');
const activeFilter = document.querySelector('#customer-active-filter');
const pageLabel = document.querySelector('#customers-page');
const previousButton = document.querySelector('#customers-previous');
const nextButton = document.querySelector('#customers-next');
const pageSize = 10;
let editingCustomerId = null;
let currentPage = 1;
let totalPages = 1;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
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

async function loadClientes() {
  try {
    const query = searchInput?.value.trim() || '';
    const active = activeFilter?.value || '';
    const response = await fetch(`/api/clientes?q=${encodeURIComponent(query)}&ativo=${active}&page=${currentPage}&limit=${pageSize}`, { credentials: 'same-origin' });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({ error: 'Não foi possível carregar os clientes.' }));
      throw new Error(payload.error || 'Não foi possível carregar os clientes.');
    }

    const { clientes, pagination } = await response.json();
    currentPage = pagination.page;
    totalPages = Math.max(1, pagination.pages);
    updatePagination();
    if (!clientes.length) {
      body.innerHTML = '<tr><td colspan="5" class="empty-state">Nenhum cliente encontrado.</td></tr>';
      return;
    }

    body.innerHTML = clientes.map((cliente) => `
      <tr>
        <td>${escapeHtml(cliente.nome)}</td>
        <td>${escapeHtml(cliente.email || cliente.telefone || 'Sem contato')}</td>
        <td>${escapeHtml(cliente.documento || 'Sem documento')}</td>
        <td>${cliente.ativo ? 'Ativo' : 'Inativo'}</td>
        <td>
          <button type="button" data-action="edit" data-id="${cliente.id_cliente}">Editar</button>
          <button type="button" data-action="toggle" data-id="${cliente.id_cliente}" data-active="${cliente.ativo}">${cliente.ativo ? 'Arquivar' : 'Reativar'}</button>
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
  const wasEditing = Boolean(editingCustomerId);
  try {
    const response = await fetch(editingCustomerId ? `/api/clientes/${editingCustomerId}` : '/api/clientes', {
      method: editingCustomerId ? 'PUT' : 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        nome: formData.get('nome'),
        documento: formData.get('documento'),
        telefone: formData.get('telefone'),
        email: formData.get('email'),
        endereco: formData.get('endereco')
      })
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || 'Não foi possível salvar o cliente.');
    }

    form.reset();
    resetEditing();
    setMessage(wasEditing ? 'Cliente atualizado com sucesso.' : 'Cliente salvo com sucesso.', 'success');
    await loadClientes();
  } catch (error) {
    setMessage(error.message, 'error');
  }
});

function resetEditing() {
  editingCustomerId = null;
  title.textContent = 'Novo cliente';
  submitButton.textContent = 'Salvar cliente';
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
      const response = await fetch(`/api/clientes/${id}`, { credentials: 'same-origin' });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Não foi possível carregar o cliente.');
      }
      editingCustomerId = id;
      for (const field of ['nome', 'documento', 'telefone', 'email', 'endereco']) {
        form.elements[field].value = payload.cliente[field] || '';
      }
      title.textContent = 'Editar cliente';
      submitButton.textContent = 'Salvar alterações';
      cancelEditButton.hidden = false;
      form.elements.nome.focus();
      return;
    }

    const ativo = button.dataset.active !== 'true';
    const response = await fetch(`/api/clientes/${id}/ativo`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ ativo })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || 'Não foi possível atualizar a situação.');
    }
    setMessage(ativo ? 'Cliente reativado.' : 'Cliente arquivado.', 'success');
    await loadClientes();
  } catch (error) {
    setMessage(error.message, 'error');
  }
});

cancelEditButton?.addEventListener('click', resetEditing);
searchInput?.addEventListener('input', () => { currentPage = 1; loadClientes(); });
activeFilter?.addEventListener('change', () => { currentPage = 1; loadClientes(); });
previousButton?.addEventListener('click', () => { currentPage -= 1; loadClientes(); });
nextButton?.addEventListener('click', () => { currentPage += 1; loadClientes(); });

logoutButton?.addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
  window.location.href = '/login.html';
});

(async () => {
  const isLoggedIn = await ensureAuthentication();
  if (isLoggedIn) {
    await loadClientes();
  }
})();
