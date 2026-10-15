const form = document.querySelector('#peca-form');
const messageBox = document.querySelector('#peca-message');
const body = document.querySelector('#pecas-body');
const logoutButton = document.querySelector('#logout-button');
const searchInput = document.querySelector('#part-search');
const title = document.querySelector('#cadastro-title');
const submitButton = form?.querySelector('[type="submit"]');
const cancelEditButton = document.querySelector('#cancel-edit');
const activeFilter = document.querySelector('#part-active-filter');
const pageLabel = document.querySelector('#parts-page');
const previousButton = document.querySelector('#parts-previous');
const nextButton = document.querySelector('#parts-next');
const pageSize = 10;
let editingPartId = null;
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

async function loadPecas() {
  try {
    const query = searchInput?.value.trim() || '';
    const active = activeFilter?.value || '';
    const response = await fetch(`/api/pecas?q=${encodeURIComponent(query)}&ativo=${active}&page=${currentPage}&limit=${pageSize}`, { credentials: 'same-origin' });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({ error: 'Não foi possível carregar as peças.' }));
      throw new Error(payload.error || 'Não foi possível carregar as peças.');
    }

    const { pecas, pagination } = await response.json();
    currentPage = pagination.page;
    totalPages = Math.max(1, pagination.pages);
    updatePagination();
    if (!pecas.length) {
      body.innerHTML = '<tr><td colspan="4" class="empty-state">Nenhuma peça encontrada.</td></tr>';
      return;
    }

    body.innerHTML = pecas.map((peca) => `
      <tr>
        <td>${escapeHtml(peca.codigo)}</td>
        <td>${escapeHtml(peca.nome)}</td>
        <td>${peca.estoque_minimo}</td>
        <td>
          <button type="button" data-action="edit" data-id="${peca.id_peca}">Editar</button>
          <button type="button" data-action="toggle" data-id="${peca.id_peca}" data-active="${peca.ativo}">${peca.ativo ? 'Arquivar' : 'Reativar'}</button>
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
  const wasEditing = Boolean(editingPartId);
  try {
    const response = await fetch(editingPartId ? `/api/pecas/${editingPartId}` : '/api/pecas', {
      method: editingPartId ? 'PUT' : 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        codigo: formData.get('codigo'),
        nome: formData.get('nome'),
        descricao: formData.get('descricao'),
        preco_atual: Number(formData.get('preco_atual')),
        estoque_minimo: Number(formData.get('estoque_minimo')),
        ativo: formData.get('ativo') === 'true'
      })
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || 'Não foi possível salvar a peça.');
    }

    form.reset();
    resetEditing();
    setMessage(wasEditing ? 'Peça atualizada com sucesso.' : 'Peça salva com sucesso.', 'success');
    await loadPecas();
  } catch (error) {
    setMessage(error.message, 'error');
  }
});

function resetEditing() {
  editingPartId = null;
  title.textContent = 'Nova peça';
  submitButton.textContent = 'Salvar peça';
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
      const response = await fetch(`/api/pecas/${id}`, { credentials: 'same-origin' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Não foi possível carregar a peça.');
      editingPartId = id;
      for (const field of ['codigo', 'nome', 'descricao', 'preco_atual', 'estoque_minimo']) {
        form.elements[field].value = payload.peca[field] ?? '';
      }
      form.elements.ativo.value = String(Boolean(payload.peca.ativo));
      title.textContent = 'Editar peça';
      submitButton.textContent = 'Salvar alterações';
      cancelEditButton.hidden = false;
      form.elements.codigo.focus();
      return;
    }
    const ativo = button.dataset.active !== 'true';
    const response = await fetch(`/api/pecas/${id}/ativo`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ ativo })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Não foi possível atualizar a situação.');
    setMessage(ativo ? 'Peça reativada.' : 'Peça arquivada.', 'success');
    await loadPecas();
  } catch (error) {
    setMessage(error.message, 'error');
  }
});

cancelEditButton?.addEventListener('click', resetEditing);
searchInput?.addEventListener('input', () => { currentPage = 1; loadPecas(); });
activeFilter?.addEventListener('change', () => { currentPage = 1; loadPecas(); });
previousButton?.addEventListener('click', () => { currentPage -= 1; loadPecas(); });
nextButton?.addEventListener('click', () => { currentPage += 1; loadPecas(); });

logoutButton?.addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
  window.location.href = '/login.html';
});

(async () => {
  const isLoggedIn = await ensureAuthentication();
  if (isLoggedIn) {
    await loadPecas();
  }
})();
