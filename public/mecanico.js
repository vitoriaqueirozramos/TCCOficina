(async () => {
  const { esc } = OT;
  const container = document.querySelector('#assigned-orders');
  const countLabel = document.querySelector('#orders-count');

  document.querySelector('#mechanic-brand').innerHTML = OT.brandHtml();
  OT.hydrateIcons();
  document.querySelector('#logout-button').addEventListener('click', OT.logout);

  let user;
  try {
    ({ user } = await OT.api('/api/auth/me'));
  } catch {
    return;
  }
  if (user.perfil !== 'MECANICO') {
    window.location.replace('/');
    return;
  }
  document.querySelector('#mechanic-title').textContent = `Minhas ordens, ${user.nome.split(' ')[0]}`;

  function orderCard(order) {
    const transitions = order.transicoes || [];
    const controls = transitions.length
      ? `<form data-order-id="${esc(order.id_os)}">
           <div class="field">
             <label for="status-${order.id_os}">Atualizar andamento</label>
             <select id="status-${order.id_os}" name="id_status_os" required>
               ${transitions.map((status) => `<option value="${esc(status.id_status_os)}">${esc(status.nome)}</option>`).join('')}
             </select>
           </div>
           <div class="field">
             <label for="note-${order.id_os}">Observação <span class="optional">(opcional)</span></label>
             <input id="note-${order.id_os}" name="observacao" type="text" maxlength="255" placeholder="O que foi feito ou encontrado">
           </div>
           <button type="submit" class="btn btn-primary">Registrar andamento</button>
         </form>`
      : '<form><p class="muted">Aguardando o atendimento para a próxima etapa.</p></form>';

    return `<article class="card order-card">
      <div class="order-card-head">
        <span class="os-tag">OS ${esc(order.id_os)}</span>
        ${OT.statusBadge(order.status_codigo, order.status_nome)}
      </div>
      <div class="order-card-body">
        <div class="vehicle-line">${OT.plate(order.veiculo_placa)}<strong>${esc(`${order.veiculo_marca} ${order.veiculo_modelo}`)}</strong></div>
        <dl>
          <div><dt>Cliente</dt><dd>${esc(order.cliente_nome)}</dd></div>
          <div><dt>Diagnóstico</dt><dd>${esc(order.diagnostico || 'Ainda não registrado')}</dd></div>
          <div><dt>Observações</dt><dd>${esc(order.observacoes || 'Nenhuma')}</dd></div>
          <div><dt>Previsão de conclusão</dt><dd>${esc(OT.dateTime(order.previsao_conclusao, 'Sem previsão'))}</dd></div>
        </dl>
      </div>
      ${controls}
    </article>`;
  }

  async function loadOrders() {
    container.innerHTML = '<p class="loading"><span class="spinner"></span>Carregando…</p>';
    try {
      const { ordens } = await OT.api('/api/ordens-servico/minhas');
      countLabel.textContent = ordens.length === 0
        ? 'Nenhuma ordem em andamento atribuída a você.'
        : `${ordens.length} ${ordens.length === 1 ? 'ordem em andamento atribuída' : 'ordens em andamento atribuídas'} a você.`;
      container.innerHTML = ordens.length
        ? ordens.map(orderCard).join('')
        : `<div class="card state">${OT.icon('vazio')}<h3>Nada na sua fila</h3><p>Quando o atendimento atribuir uma ordem a você, ela aparece aqui.</p></div>`;
    } catch (error) {
      countLabel.textContent = 'Não foi possível carregar as ordens.';
      container.innerHTML = `<div class="card state">${OT.icon('alerta')}<h3>Falha ao carregar</h3><p>${esc(error.message)}</p></div>`;
    }
  }

  container.addEventListener('submit', async (event) => {
    const form = event.target.closest('form[data-order-id]');
    if (!form) return;
    event.preventDefault();
    const data = new FormData(form);
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const { ordem } = await OT.api(`/api/ordens-servico/${form.dataset.orderId}/meu-status`, {
        method: 'POST',
        body: { id_status_os: Number(data.get('id_status_os')), observacao: String(data.get('observacao') || '').trim() || null }
      });
      OT.toast(`OS ${ordem.id_os}: andamento atualizado para ${ordem.status_nome}.`);
      await loadOrders();
    } catch (error) {
      OT.toast(error.message, 'error');
      button.disabled = false;
    }
  });

  document.querySelector('#refresh-orders').addEventListener('click', loadOrders);
  await loadOrders();
})();
