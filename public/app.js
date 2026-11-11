(async () => {
  const { esc } = OT;
  const user = await OT.initPage('painel');
  if (!user) return;

  const $ = (selector) => document.querySelector(selector);
  const plural = (count, one, many) => `${OT.number(count)} ${Number(count) === 1 ? one : many}`;

  const hour = new Date().getHours();
  const saudacao = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  $('#greeting').textContent = `${saudacao}, ${user.nome.split(' ')[0]}`;
  const hoje = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
  $('#today-label').textContent = `${hoje.charAt(0).toUpperCase()}${hoje.slice(1)}. Situação da oficina neste momento.`;

  function showSummary({ summary, os_por_status: status, reposicao, equipe }) {
    $('#metric-os-abertas').textContent = OT.number(summary.os_abertas);
    $('#note-os').innerHTML = `<strong>${OT.number(summary.os_em_diagnostico)}</strong> em diagnóstico e <strong>${OT.number(summary.os_em_execucao)}</strong> em execução`;

    $('#metric-clientes').textContent = OT.number(summary.clientes_cadastrados);
    $('#note-clientes').innerHTML = `<strong>${OT.number(summary.veiculos_ativos)}</strong> veículos ativos vinculados`;

    $('#metric-mecanicos').textContent = OT.number(summary.mecanicos_ativos);
    $('#note-mecanicos').innerHTML = summary.os_sem_responsavel > 0
      ? `<strong>${plural(summary.os_sem_responsavel, 'ordem', 'ordens')}</strong> sem responsável definido`
      : 'Todas as ordens têm responsável';

    $('#metric-pecas').textContent = OT.number(summary.pecas_em_estoque);
    $('#note-pecas').innerHTML = `<strong>${OT.number(summary.unidades_em_estoque)}</strong> unidades; <strong>${OT.number(summary.pecas_abaixo_minimo)}</strong> abaixo do mínimo`;

    const alert = $('#stock-alert');
    if (summary.pecas_abaixo_minimo > 0) {
      const semEstoque = summary.pecas_sem_estoque > 0 ? `, ${plural(summary.pecas_sem_estoque, 'delas sem nenhuma unidade', 'delas sem nenhuma unidade')}` : '';
      $('#stock-alert-text').innerHTML = `<strong>${plural(summary.pecas_abaixo_minimo, 'peça está', 'peças estão')} abaixo do estoque mínimo</strong>${semEstoque}. <a href="/estoque.html?situacao=reposicao">Ver o que repor</a>`;
      alert.hidden = false;
    } else {
      alert.hidden = true;
    }

    const maior = Math.max(1, ...status.map((item) => item.total));
    $('#status-bars').innerHTML = status.map((item) => `
      <div class="status-bar-row">
        <span>${esc(item.nome)}</span>
        <span class="status-bar-track"><span class="status-bar-fill s-${item.codigo.toLowerCase()}" style="width:${Math.round((item.total / maior) * 100)}%"></span></span>
        <span class="num">${OT.number(item.total)}</span>
      </div>`).join('');

    $('#restock-list').innerHTML = reposicao.length
      ? reposicao.map((peca) => `
        <li>
          <span><span class="strong">${esc(peca.nome)}</span><span class="cell-sub">${esc(peca.codigo)}, mínimo ${OT.number(peca.estoque_minimo)} ${esc(peca.unidade)}</span></span>
          <span class="badge ${peca.situacao === 'SEM_ESTOQUE' ? 'danger' : 'warn'}">${peca.situacao === 'SEM_ESTOQUE' ? 'Sem estoque' : `Restam ${OT.number(peca.saldo_atual)}`}</span>
        </li>`).join('')
      : '<li><span class="muted">Nenhuma peça abaixo do mínimo.</span></li>';

    $('#team-list').innerHTML = equipe.length
      ? equipe.map((mecanico) => `
        <li>
          <span><span class="strong">${esc(mecanico.nome)}</span><span class="cell-sub">${esc(mecanico.especialidade || 'Sem especialidade informada')}</span></span>
          <span class="badge plain ${mecanico.ordens_em_andamento > 0 ? 'petroleo' : 'neutral'}">${plural(mecanico.ordens_em_andamento, 'ordem', 'ordens')}</span>
        </li>`).join('')
      : '<li><span class="muted">Nenhum mecânico ativo.</span></li>';
  }

  function showRecentOrders(ordens) {
    const body = $('#recent-orders');
    if (ordens.length === 0) {
      body.innerHTML = OT.stateRow(5, { title: 'Nenhuma ordem de serviço', text: 'As ordens abertas aparecem aqui.' });
      return;
    }
    body.innerHTML = ordens.map((ordem) => `
      <tr>
        <td data-label="Ordem"><a class="os-tag" href="/ordens-servico.html#os-${esc(ordem.id_os)}">OS ${esc(ordem.id_os)}</a><span class="cell-sub">${esc(OT.date(ordem.aberta_em))}</span></td>
        <td data-label="Cliente">${esc(ordem.cliente_nome)}</td>
        <td data-label="Veículo">${OT.plate(ordem.veiculo_placa)}</td>
        <td data-label="Responsável">${ordem.mecanico_nome ? esc(ordem.mecanico_nome) : '<span class="muted">Sem responsável</span>'}</td>
        <td data-label="Status">${OT.statusBadge(ordem.status_codigo, ordem.status_nome)}</td>
      </tr>`).join('');
  }

  async function checkService(url, dot, label, name, okText, failText) {
    let ok = false;
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
      ok = response.ok;
    } catch {
      ok = false;
    }
    dot.className = `dot ${ok ? 'ok' : 'error'}`;
    label.textContent = `${name}: ${ok ? okText : failText}`;
  }

  async function refresh() {
    $('#recent-orders').innerHTML = OT.loadingRow(5);
    const results = await Promise.allSettled([
      OT.api('/api/dashboard/summary').then(showSummary),
      OT.api('/api/ordens-servico?limit=8').then((payload) => showRecentOrders(payload.ordens)),
      checkService('/api/health', $('#api-dot'), $('#api-status'), 'Aplicação', 'disponível', 'indisponível'),
      checkService('/api/health/database', $('#database-dot'), $('#database-status'), 'Banco de dados', 'conectado', 'sem conexão')
    ]);
    const failure = results.find((result) => result.status === 'rejected');
    if (failure) {
      OT.toast(`Não foi possível atualizar o painel: ${failure.reason.message}`, 'error');
      if (results[1].status === 'rejected') {
        $('#recent-orders').innerHTML = OT.stateRow(5, { iconName: 'alerta', title: 'Ordens indisponíveis', text: results[1].reason.message });
      }
    }
    $('#last-checked').textContent = `Atualizado às ${new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date())}`;
  }

  $('#refresh-button').addEventListener('click', refresh);
  await refresh();
})();
