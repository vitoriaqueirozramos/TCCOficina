const form = document.querySelector('#servico-form');
const messageBox = document.querySelector('#servico-message');
const body = document.querySelector('#servicos-body');
const logoutButton = document.querySelector('#logout-button');
const searchInput = document.querySelector('#service-search');
const title = document.querySelector('#cadastro-title');
const submitButton = form?.querySelector('[type="submit"]');
const cancelEditButton = document.querySelector('#cancel-edit');
const activeFilter = document.querySelector('#service-active-filter');
const pageLabel = document.querySelector('#services-page');
const previousButton = document.querySelector('#services-previous');
const nextButton = document.querySelector('#services-next');
const pageSize = 10;
let editingServiceId = null;
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

async function loadServicos() {
  try {
    const query = searchInput?.value.trim() || '';
    const active = activeFilter?.value || '';
    const response = await fetch(`/api/servicos?q=${encodeURIComponent(query)}&ativo=${active}&page=${currentPage}&limit=${pageSize}`, { credentials: 'same-origin' });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({ error: 'Não foi possível carregar os serviços.' }));
      throw new Error(payload.error || 'Não foi possível carregar os serviços.');
    }

    const { servicos, pagination } = await response.json();
    currentPage = pagination.page;
    totalPages = Math.max(1, pagination.pages);
    updatePagination();
    if (!servicos.length) {
      body.innerHTML = '<tr><td colspan="4" class="empty-state">Nenhum serviço encontrado.</td></tr>';
      return;
    }

    body.innerHTML = servicos.map((servico) => `
      <tr>
        <td>${escapeHtml(servico.nome)}</td>
        <td>R$ ${Number(servico.preco_atual).toFixed(2).replace('.', ',')}</td>
        <td>${servico.ativo ? 'Ativo' : 'Inativo'}</td>
        <td>
          <button type="button" data-action="edit" data-id="${servico.id_servico}">Editar</button>
          <button type="button" data-action="toggle" data-id="${servico.id_servico}" data-active="${servico.ativo}">${servico.ativo ? 'Arquivar' : 'Reativar'}</button>
        </td>
      </tr>
    `).join('');
  } catch (error) {
    body.innerHTML = `<tr><td colspan="4" class="empty-state">${escapeHtml(error.message)}</td></tr>`;
  }
}

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  setMessage('');

  const formData = new FormData(form);
  const wasEditing = Boolean(editingServiceId);
  try {
    const response = await fetch(editingServiceId ? `/api/servicos/${editingServiceId}` : '/api/servicos', {
      method: editingServiceId ? 'PUT' : 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        nome: formData.get('nome'),
        descricao: formData.get('descricao'),
        preco_atual: Number(formData.get('preco_atual')),
        ativo: formData.get('ativo') === 'true'
      })
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || 'Não foi possível salvar o serviço.');
    }

    form.reset();
    resetEditing();
    setMessage(wasEditing ? 'Serviço atualizado com sucesso.' : 'Serviço salvo com sucesso.', 'success');
    await loadServicos();
  } catch (error) {
    setMessage(error.message, 'error');
  }
});

function resetEditing() {
  editingServiceId = null;
  title.textContent = 'Novo serviço';
  submitButton.textContent = 'Salvar serviço';
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
  if (!button) return;
  const id = button.dataset.id;
  try {
    if (button.dataset.action === 'edit') {
      const response = await fetch(`/api/servicos/${id}`, { credentials: 'same-origin' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Não foi possível carregar o serviço.');
      editingServiceId = id;
      for (const field of ['nome', 'descricao', 'preco_atual']) {
        form.elements[field].value = payload.servico[field] ?? '';
      }
      form.elements.ativo.value = String(Boolean(payload.servico.ativo));
      title.textContent = 'Editar serviço';
      submitButton.textContent = 'Salvar alterações';
      cancelEditButton.hidden = false;
      form.elements.nome.focus();
      return;
    }
    const ativo = button.dataset.active !== 'true';
    const response = await fetch(`/api/servicos/${id}/ativo`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ ativo })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Não foi possível atualizar a situação.');
    setMessage(ativo ? 'Serviço reativado.' : 'Serviço arquivado.', 'success');
    await loadServicos();
  } catch (error) {
    setMessage(error.message, 'error');
  }
});

cancelEditButton?.addEventListener('click', resetEditing);
searchInput?.addEventListener('input', () => { currentPage = 1; loadServicos(); });
activeFilter?.addEventListener('change', () => { currentPage = 1; loadServicos(); });
previousButton?.addEventListener('click', () => { currentPage -= 1; loadServicos(); });
nextButton?.addEventListener('click', () => { currentPage += 1; loadServicos(); });

logoutButton?.addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
  window.location.href = '/login.html';
});

(async () => {
  const isLoggedIn = await ensureAuthentication();
  if (isLoggedIn) {
    await loadServicos();
  }
})();
