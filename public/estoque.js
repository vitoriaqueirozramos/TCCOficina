const form = document.getElementById('estoque-form');
const list = document.getElementById('estoque-list');
const selectPeca = document.getElementById('id_peca');

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
    ...options
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || 'Erro ao executar operação.');
  }

  return payload;
}

async function loadParts() {
  const payload = await fetchJson('/api/pecas');
  const options = payload.pecas || [];

  selectPeca.innerHTML = '<option value="">Selecione</option>' + options.map((peca) => `
    <option value="${peca.id_peca}">${peca.nome} (${peca.codigo})</option>
  `).join('');
}

async function loadMovements() {
  const payload = await fetchJson('/api/estoque/movimentos');
  const movimentos = payload.movimentos || [];

  if (movimentos.length === 0) {
    list.innerHTML = '<p>Nenhuma movimentação registrada.</p>';
    return;
  }

  list.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Peça</th>
          <th>Motivo</th>
          <th>Quantidade</th>
          <th>Registrado por</th>
          <th>Data</th>
        </tr>
      </thead>
      <tbody>
        ${movimentos.map((mov) => `
          <tr>
            <td>${mov.peca_nome || mov.id_peca}</td>
            <td>${mov.motivo}</td>
            <td>${mov.quantidade_delta}</td>
            <td>${mov.registrado_por_nome}</td>
            <td>${new Date(mov.criado_em).toLocaleString('pt-BR')}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

form?.addEventListener('submit', async (event) => {
  event.preventDefault();

  try {
    const body = {
      id_peca: Number(document.getElementById('id_peca').value),
      motivo: document.getElementById('motivo').value,
      quantidade_delta: Number(document.getElementById('quantidade_delta').value),
      observacao: document.getElementById('observacao').value
    };

    await fetchJson('/api/estoque/movimentos', {
      method: 'POST',
      body: JSON.stringify(body)
    });

    form.reset();
    await loadMovements();
  } catch (error) {
    window.alert(error.message);
  }
});

(async () => {
  try {
    await loadParts();
    await loadMovements();
  } catch (error) {
    window.alert(error.message);
  }
})();
