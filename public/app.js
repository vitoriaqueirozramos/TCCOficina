const apiStatus = document.querySelector('#api-status');
const apiSymbol = document.querySelector('#api-symbol');
const databaseStatus = document.querySelector('#database-status');
const databaseSymbol = document.querySelector('#database-symbol');
const statusContainer = document.querySelector('#service-status');
const lastChecked = document.querySelector('#last-checked');
const todayLabel = document.querySelector('#today-label');
const refreshButton = document.querySelector('#refresh-status');
const accountLink = document.querySelector('.account-link');
const metricOsAbertas = document.querySelector('#metric-os-abertas');
const metricOsEmExecucao = document.querySelector('#metric-os-em-execucao');
const metricOsAguardandoPecas = document.querySelector('#metric-os-aguardando-pecas');
const metricPecasAbaixoMinimo = document.querySelector('#metric-pecas-abaixo-minimo');
const recentOrdersList = document.querySelector('#recent-orders-list');
const dataState = document.querySelector('.data-state');

async function hydrateAccountState() {
  if (!accountLink) {
    return;
  }

  try {
    const response = await fetch('/api/auth/me', { method: 'GET', credentials: 'same-origin' });
    if (!response.ok) {
      return;
    }

    const { user } = await response.json();
    const firstName = user?.nome?.split(' ')[0] || 'Conta';
    accountLink.textContent = `${firstName} · Sair`;
    accountLink.setAttribute('aria-label', `Sair da conta de ${user.nome}`);
    accountLink.href = '#';
    accountLink.addEventListener('click', async (event) => {
      event.preventDefault();
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
      window.location.href = '/login.html';
    });
  } catch {
    // Ignore and keep the default login action.
  }
}

function setStatus(label, symbol, message, state) {
  label.textContent = message;
  symbol.className = `status-symbol status-${state}`;
}

async function checkService(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    return response.ok;
  } catch {
    return false;
  }
}

async function refreshDashboardSummary() {
  if (!metricOsAbertas || !metricOsEmExecucao || !metricOsAguardandoPecas || !metricPecasAbaixoMinimo) {
    return;
  }

  try {
    const response = await fetch('/api/dashboard/summary', { credentials: 'same-origin' });
    if (!response.ok) {
      throw new Error('Summary unavailable');
    }

    const { summary } = await response.json();
    metricOsAbertas.textContent = Number(summary?.os_abertas || 0);
    metricOsEmExecucao.textContent = Number(summary?.os_em_execucao || 0);
    metricOsAguardandoPecas.textContent = Number(summary?.os_aguardando_pecas || 0);
    metricPecasAbaixoMinimo.textContent = Number(summary?.pecas_abaixo_minimo || 0);

    if (dataState) {
      dataState.textContent = 'DADOS ATUALIZADOS';
    }
  } catch {
    metricOsAbertas.textContent = '—';
    metricOsEmExecucao.textContent = '—';
    metricOsAguardandoPecas.textContent = '—';
    metricPecasAbaixoMinimo.textContent = '—';

    if (dataState) {
      dataState.textContent = 'INDISPONÍVEL';
    }
  }
}

async function refreshRecentOrders() {
  if (!recentOrdersList) {
    return;
  }

  try {
    const response = await fetch('/api/ordens-servico', { credentials: 'same-origin' });
    if (!response.ok) {
      throw new Error('Oops');
    }

    const { ordens } = await response.json();
    const latest = Array.isArray(ordens) ? ordens.slice(0, 5) : [];

    if (latest.length === 0) {
      recentOrdersList.innerHTML = `
        <div class="empty-state">
          <span class="empty-marker" aria-hidden="true">—</span>
          <h3>Nenhuma ordem carregada</h3>
          <p>As ordens aparecerão aqui quando o módulo estiver conectado ao banco de dados.</p>
        </div>
      `;
      return;
    }

    recentOrdersList.innerHTML = `
      <div class="activity-list">
        ${latest.map((ordem) => `
          <article class="activity-item">
            <div>
              <span class="activity-tag">OS ${ordem.id_os}</span>
              <strong>${ordem.cliente_nome}</strong>
            </div>
            <div class="activity-meta">
              <span>${ordem.veiculo_placa}</span>
              <span>${ordem.status_nome}</span>
            </div>
          </article>
        `).join('')}
      </div>
    `;
  } catch {
    recentOrdersList.innerHTML = `
      <div class="empty-state">
        <span class="empty-marker" aria-hidden="true">—</span>
        <h3>Não foi possível carregar</h3>
        <p>Os dados recentes da oficina ficaram indisponíveis no momento.</p>
      </div>
    `;
  }
}

async function refreshStatus() {
  statusContainer.setAttribute('aria-busy', 'true');
  setStatus(apiStatus, apiSymbol, 'Verificando', 'loading');
  setStatus(databaseStatus, databaseSymbol, 'Verificando', 'loading');

  const [apiAvailable, databaseAvailable] = await Promise.all([
    checkService('/api/health'),
    checkService('/api/health/database')
  ]);

  setStatus(
    apiStatus,
    apiSymbol,
    apiAvailable ? 'Disponível' : 'Indisponível',
    apiAvailable ? 'ok' : 'error'
  );
  setStatus(
    databaseStatus,
    databaseSymbol,
    databaseAvailable ? 'Conectado' : 'Não conectado',
    databaseAvailable ? 'ok' : 'error'
  );

  lastChecked.textContent = `Atualizado às ${new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date())}`;
  statusContainer.setAttribute('aria-busy', 'false');
  await Promise.all([refreshDashboardSummary(), refreshRecentOrders()]);
}

if (todayLabel) {
  todayLabel.textContent = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  }).format(new Date());
}

hydrateAccountState();
refreshButton?.addEventListener('click', refreshStatus);
refreshStatus();
