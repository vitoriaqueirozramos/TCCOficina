const ordersContainer = document.querySelector('#assigned-orders');
const message = document.querySelector('#mechanic-message');
const countLabel = document.querySelector('#orders-count');
const refreshButton = document.querySelector('#refresh-orders');
const accountLink = document.querySelector('#account-link');

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function setMessage(text, type = '') {
  message.textContent = text;
  message.className = `mechanic-message ${type}`.trim();
}

async function checkMechanicSession() {
  const response = await fetch('/api/auth/me', { credentials: 'same-origin' });
  if (!response.ok) {
    window.location.replace('/login.html');
    return false;
  }
  const { user } = await response.json();
  if (user.perfil !== 'MECANICO') {
    window.location.replace('/');
    return false;
  }
  accountLink.textContent = `${user.nome.split(' ')[0]} · Sair`;
  accountLink.setAttribute('aria-label', `Sair da conta de ${user.nome}`);
  return true;
}

function formatDate(value) {
  if (!value) return 'Sem previsão';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sem previsão';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

async function loadAssignedOrders() {
  countLabel.textContent = 'CARREGANDO';
  try {
    const response = await fetch('/api/ordens-servico/minhas', { credentials: 'same-origin' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Não foi possível carregar as ordens.');
    const orders = payload.ordens || [];
    countLabel.textContent = `${orders.length} ${orders.length === 1 ? 'ORDEM' : 'ORDENS'}`;
    if (orders.length === 0) {
      ordersContainer.innerHTML = '<div class="empty-state"><span class="empty-marker" aria-hidden="true">—</span><h3>Nenhuma ordem atribuída</h3><p>Quando uma ordem for direcionada a você, ela aparecerá nesta lista.</p></div>';
      return;
    }

    ordersContainer.innerHTML = orders.map((order) => {
      const transitions = order.transicoes || [];
      const controls = transitions.length
        ? `<form class="mechanic-update" data-order-id="${escapeHtml(order.id_os)}">
             <label>Atualizar andamento
               <select name="id_status_os" required>${transitions.map((status) => `<option value="${escapeHtml(status.id_status_os)}">${escapeHtml(status.nome)}</option>`).join('')}</select>
             </label>
             <label>Observação
               <input name="observacao" type="text" maxlength="255" placeholder="Nota sobre o andamento">
             </label>
             <button type="submit">Registrar andamento</button>
           </form>`
        : '<p>Sem transições disponíveis.</p>';

      return `<article class="mechanic-order">
        <div>
          <span class="mechanic-status">${escapeHtml(order.status_nome)}</span>
          <h3>OS ${escapeHtml(order.id_os)} · ${escapeHtml(order.cliente_nome)}</h3>
          <p><strong>Veículo:</strong> ${escapeHtml(order.veiculo_placa)} · ${escapeHtml(order.veiculo_marca)} ${escapeHtml(order.veiculo_modelo)}</p>
          <p><strong>Diagnóstico:</strong> ${escapeHtml(order.diagnostico || 'Ainda não registrado')}</p>
          <p><strong>Observações:</strong> ${escapeHtml(order.observacoes || 'Nenhuma')}</p>
          <p><strong>Previsão:</strong> ${escapeHtml(formatDate(order.previsao_conclusao))}</p>
        </div>
        ${controls}
      </article>`;
    }).join('');
  } catch (error) {
    countLabel.textContent = 'INDISPONÍVEL';
    ordersContainer.innerHTML = `<div class="empty-state"><h3>Falha ao carregar as ordens</h3><p>${escapeHtml(error.message)}</p></div>`;
  }
}

ordersContainer.addEventListener('submit', async (event) => {
  const form = event.target.closest('form[data-order-id]');
  if (!form) return;
  event.preventDefault();
  const data = new FormData(form);
  const response = await fetch(`/api/ordens-servico/${form.dataset.orderId}/meu-status`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id_status_os: Number(data.get('id_status_os')),
      observacao: String(data.get('observacao') || '').trim() || null
    })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    setMessage(result.error || 'Não foi possível registrar o andamento.');
    return;
  }
  setMessage('Andamento atualizado.', 'success');
  await loadAssignedOrders();
});

accountLink.addEventListener('click', async (event) => {
  event.preventDefault();
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
  window.location.assign('/login.html');
});

refreshButton.addEventListener('click', loadAssignedOrders);

(async () => {
  if (await checkMechanicSession()) await loadAssignedOrders();
})();
