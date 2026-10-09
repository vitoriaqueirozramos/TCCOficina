const apiStatus = document.querySelector('#api-status');
const apiSymbol = document.querySelector('#api-symbol');
const databaseStatus = document.querySelector('#database-status');
const databaseSymbol = document.querySelector('#database-symbol');
const statusContainer = document.querySelector('#service-status');
const lastChecked = document.querySelector('#last-checked');
const todayLabel = document.querySelector('#today-label');
const refreshButton = document.querySelector('#refresh-status');

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
}

if (todayLabel) {
  todayLabel.textContent = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  }).format(new Date());
}

refreshButton?.addEventListener('click', refreshStatus);
refreshStatus();
