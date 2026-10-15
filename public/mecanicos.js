const form = document.querySelector('#mecanico-form');
const messageBox = document.querySelector('#mecanico-message');
const body = document.querySelector('#mecanicos-body');
const select = document.querySelector('select[name="id_usuario"]');
const logoutButton = document.querySelector('#logout-button');
const searchInput = document.querySelector('#mechanic-search');
const title = document.querySelector('#cadastro-title');
const submitButton = form?.querySelector('[type="submit"]');
const cancelEditButton = document.querySelector('#cancel-edit');
const activeFilter = document.querySelector('#mechanic-active-filter');
const pageLabel = document.querySelector('#mechanics-page');
const previousButton = document.querySelector('#mechanics-previous');
const nextButton = document.querySelector('#mechanics-next');
const pageSize = 10;
let editingMechanicId = null;
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

async function loadUsuariosSelect() {
  const response = await fetch('/api/usuarios', { credentials: 'same-origin' });
  if (!response.ok) {
    throw new Error('Não foi possível carregar os usuários.');
  }

  const { usuarios } = await response.json();
  const options = usuarios.map((user) => `<option value="${user.id_usuario}">${user.nome}</option>`).join('');
  select.innerHTML = `<option value="">Selecione um usuário</option>${options}`;
}

async function loadMecanicos() {
  try {
    const query = searchInput?.value.trim() || '';
    const active = activeFilter?.value || '';
    const response = await fetch(`/api/mecanicos?q=${encodeURIComponent(query)}&ativo=${active}&page=${currentPage}&limit=${pageSize}`, { credentials: 'same-origin' });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({ error: 'Não foi possível carregar os mecânicos.' }));
      throw new Error(payload.error || 'Não foi possível carregar os mecânicos.');
    }

    const { mecanicos, pagination } = await response.json();
    currentPage = pagination.page;
    totalPages = Math.max(1, pagination.pages);
    updatePagination();
    if (!mecanicos.length) {
      body.innerHTML = '<tr><td colspan="4" class="empty-state">Nenhum mecânico encontrado.</td></tr>';
      return;
    }

    body.innerHTML = mecanicos.map((mecanico) => `
      <tr>
        <td>${escapeHtml(mecanico.nome_usuario)}</td>
        <td>${escapeHtml(mecanico.especialidade)}</td>
        <td>${mecanico.ativo ? 'Ativo' : 'Inativo'}</td>
        <td>
          <button type="button" data-action="edit" data-id="${mecanico.id_mecanico}">Editar</button>
          <button type="button" data-action="toggle" data-id="${mecanico.id_mecanico}" data-active="${mecanico.ativo}">${mecanico.ativo ? 'Inativar' : 'Ativar'}</button>
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
  const wasEditing = Boolean(editingMechanicId);
  try {
    const response = await fetch(editingMechanicId ? `/api/mecanicos/${editingMechanicId}` : '/api/mecanicos', {
      method: editingMechanicId ? 'PUT' : 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        id_usuario: Number(formData.get('id_usuario')),
        especialidade: formData.get('especialidade'),
        ativo: formData.get('ativo') === 'true'
      })
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || 'Não foi possível salvar o mecânico.');
    }

    form.reset();
    resetEditing();
    setMessage(wasEditing ? 'Mecânico atualizado com sucesso.' : 'Mecânico salvo com sucesso.', 'success');
    await loadMecanicos();
  } catch (error) {
    setMessage(error.message, 'error');
  }
});

function resetEditing() {
  editingMechanicId = null;
  title.textContent = 'Novo mecânico';
  submitButton.textContent = 'Salvar mecânico';
  select.disabled = false;
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
    const response = await fetch(`/api/mecanicos/${id}`, { credentials: 'same-origin' });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Não foi possível carregar o mecânico.');
    const mechanic = payload.mecanico;
    if (button.dataset.action === 'edit') {
      editingMechanicId = id;
      select.value = String(mechanic.id_usuario);
      select.disabled = true;
      form.elements.especialidade.value = mechanic.especialidade;
      form.elements.ativo.value = String(Boolean(mechanic.ativo));
      title.textContent = 'Editar mecânico';
      submitButton.textContent = 'Salvar alterações';
      cancelEditButton.hidden = false;
      form.elements.especialidade.focus();
      return;
    }

    const ativo = button.dataset.active !== 'true';
    const updateResponse = await fetch(`/api/mecanicos/${id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ especialidade: mechanic.especialidade, ativo })
    });
    const updatePayload = await updateResponse.json().catch(() => ({}));
    if (!updateResponse.ok) throw new Error(updatePayload.error || 'Não foi possível atualizar a situação.');
    setMessage(ativo ? 'Mecânico ativado.' : 'Mecânico inativado.', 'success');
    await loadMecanicos();
  } catch (error) {
    setMessage(error.message, 'error');
  }
});

cancelEditButton?.addEventListener('click', resetEditing);
searchInput?.addEventListener('input', () => { currentPage = 1; loadMecanicos(); });
activeFilter?.addEventListener('change', () => { currentPage = 1; loadMecanicos(); });
previousButton?.addEventListener('click', () => { currentPage -= 1; loadMecanicos(); });
nextButton?.addEventListener('click', () => { currentPage += 1; loadMecanicos(); });

logoutButton?.addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
  window.location.href = '/login.html';
});

(async () => {
  const isLoggedIn = await ensureAuthentication();
  if (isLoggedIn) {
    await loadUsuariosSelect();
    await loadMecanicos();
  }
})();
