(async () => {
  const { esc } = OT;
  if (!await OT.initPage('movimentacoes')) return;

  const $ = (selector) => document.querySelector(selector);
  const rows = $('#rows');
  const dialog = $('#movement-dialog');
  const form = $('#movement-form');
  const formError = $('#movement-error');
  const partSelect = $('#m-peca');
  const quantityInput = $('#m-quantidade');
  const reasonSelect = $('#m-motivo');
  const preview = $('#balance-preview');
  const COLUMNS = 8;
  const filters = {
    search: $('#search'),
    tipo: $('#filter-tipo'),
    de: $('#filter-de'),
    ate: $('#filter-ate'),
    responsavel: $('#filter-responsavel'),
    os: $('#filter-os')
  };
  const FORM_TYPES = {
    ENTRADA: {
      label: 'Quantidade recebida', hint: 'Informe apenas o número; o sistema soma ao saldo.', submit: 'Registrar entrada',
      reasons: ['Compra de fornecedor', 'Devolução de cliente', 'Transferência recebida', 'Outro'], required: false
    },
    SAIDA: {
      label: 'Quantidade retirada', hint: 'Informe apenas o número; o sistema subtrai do saldo.', submit: 'Registrar saída',
      reasons: ['Venda no balcão', 'Perda ou avaria', 'Uso interno da oficina', 'Devolução ao fornecedor', 'Outro'], required: true
    },
    AJUSTE: {
      label: 'Saldo contado', hint: 'Informe quantas unidades existem na prateleira; o sistema calcula a diferença.', submit: 'Registrar ajuste',
      reasons: ['Contagem de inventário', 'Correção de lançamento', 'Outro'], required: true
    }
  };
  const params = new URLSearchParams(window.location.search);
  const state = { page: 1, parts: [], partFilter: Number(params.get('peca')) || null };

  const showFormError = (message) => {
    formError.textContent = message || '';
    formError.hidden = !message;
  };
  const currentType = () => form.elements.tipo.value;
  const selectedPart = () => state.parts.find((part) => String(part.id_peca) === partSelect.value) || null;

  async function loadSummary() {
    const { resumo, responsaveis } = await OT.api('/api/estoque/movimentos/resumo');
    $('#stat-total').textContent = OT.number(resumo.total);
    $('#note-total').innerHTML = resumo.estornos > 0
      ? `Inclui <strong>${OT.number(resumo.estornos)}</strong> ${resumo.estornos === 1 ? 'estorno' : 'estornos'} de ordens de serviço`
      : 'Todos os lançamentos registrados';
    $('#stat-entradas').textContent = OT.number(resumo.entradas);
    $('#note-entradas').innerHTML = `<strong>${OT.number(resumo.entradas_unidades)}</strong> unidades recebidas`;
    $('#stat-saidas').textContent = OT.number(resumo.saidas);
    $('#note-saidas').innerHTML = `<strong>${OT.number(resumo.saidas_unidades)}</strong> unidades, com consumo em OS`;
    $('#stat-ajustes').textContent = OT.number(resumo.ajustes);

    const selected = filters.responsavel.value;
    OT.fillSelect(filters.responsavel, responsaveis, { value: (item) => item.id_usuario, label: (item) => item.nome, placeholder: 'Todos', selected });
  }

  async function loadMovements() {
    rows.innerHTML = OT.loadingRow(COLUMNS);
    try {
      const payload = await OT.api(`/api/estoque/movimentos${OT.query({
        q: filters.search.value.trim(),
        tipo: filters.tipo.value,
        de: filters.de.value,
        ate: filters.ate.value,
        responsavel: filters.responsavel.value,
        id_os: filters.os.value,
        id_peca: state.partFilter,
        page: state.page,
        limit: 15
      })}`);
      state.page = payload.pagination.page;
      OT.renderPagination($('#pagination'), payload.pagination, (page) => { state.page = page; loadMovements(); });

      const filteredPart = state.partFilter ? state.parts.find((part) => part.id_peca === state.partFilter) : null;
      $('#filter-note').textContent = state.partFilter
        ? `Mostrando apenas a peça ${filteredPart ? filteredPart.nome : `nº ${state.partFilter}`}. Use "Limpar filtros" para ver todas.`
        : 'Do lançamento mais recente para o mais antigo.';

      if (payload.movimentos.length === 0) {
        rows.innerHTML = OT.stateRow(COLUMNS, { title: 'Nenhuma movimentação encontrada', text: 'Ajuste os filtros ou registre uma nova movimentação.' });
        return;
      }
      rows.innerHTML = payload.movimentos.map((movimento) => `
        <tr>
          <td data-label="Data e hora">${esc(OT.dateTime(movimento.criado_em))}</td>
          <td data-label="Peça"><span class="cell-main">${esc(movimento.peca_nome)}</span><span class="cell-sub code">${esc(movimento.peca_codigo)}</span></td>
          <td data-label="Tipo">${OTMovimento.badge(movimento.motivo)}</td>
          <td data-label="Quantidade" class="num">${OTMovimento.quantidade(movimento)}</td>
          <td data-label="Responsável">${esc(movimento.registrado_por_nome)}</td>
          <td data-label="Motivo">${esc(OTMovimento.motivo(movimento))}</td>
          <td data-label="Observação" class="muted">${esc(movimento.observacao || '—')}</td>
          <td data-label="Ordem de serviço">${movimento.id_os ? `<a class="os-tag" href="/ordens-servico.html#os-${esc(movimento.id_os)}">OS ${esc(movimento.id_os)}</a>` : '<span class="muted">—</span>'}</td>
        </tr>`).join('');
    } catch (error) {
      rows.innerHTML = OT.stateRow(COLUMNS, { iconName: 'alerta', title: 'Não foi possível carregar o histórico', text: error.message });
    }
  }

  async function loadParts() {
    const { pecas } = await OT.api('/api/pecas/opcoes');
    state.parts = pecas.map((part) => ({ ...part, saldo_atual: Number(part.saldo_atual) }));
    const selected = partSelect.value;
    OT.fillSelect(partSelect, state.parts, {
      value: (part) => part.id_peca,
      label: (part) => `${part.nome} (${part.codigo}) — saldo ${part.saldo_atual} ${part.unidade}`,
      placeholder: 'Selecione a peça',
      selected
    });
  }

  function updateForm() {
    const type = FORM_TYPES[currentType()];
    $('#m-quantidade-label').textContent = type.label;
    $('#m-quantidade-hint').textContent = type.hint;
    $('#movement-submit').textContent = type.submit;
    $('#m-motivo-optional').hidden = type.required;
    quantityInput.min = currentType() === 'AJUSTE' ? '0' : '1';
    const previous = reasonSelect.value;
    OT.fillSelect(reasonSelect, type.reasons, {
      value: (reason) => reason,
      label: (reason) => reason,
      placeholder: type.required ? 'Selecione o motivo' : 'Sem motivo informado',
      selected: type.reasons.includes(previous) ? previous : ''
    });
    reasonSelect.required = type.required;
    updatePreview();
  }

  // Mostra o saldo atual e o saldo que resultará do lançamento, antes de salvar.
  function computeResult() {
    const part = selectedPart();
    const value = quantityInput.value === '' ? null : Number(quantityInput.value);
    if (!part || value === null || !Number.isInteger(value)) return { part, value, result: null };
    const type = currentType();
    const result = type === 'ENTRADA' ? part.saldo_atual + value : type === 'SAIDA' ? part.saldo_atual - value : value;
    return { part, value, result, delta: result - part.saldo_atual };
  }

  function updatePreview() {
    const { part, result, delta } = computeResult();
    if (!part) {
      preview.textContent = 'Selecione a peça para ver o saldo.';
      return;
    }
    const unit = esc(part.unidade);
    if (result === null) {
      preview.innerHTML = `Saldo atual <strong>${OT.number(part.saldo_atual)} ${unit}</strong>`;
      return;
    }
    if (result < 0) {
      preview.innerHTML = `Saldo atual <strong>${OT.number(part.saldo_atual)} ${unit}</strong> <span class="badge danger">Saída maior que o saldo disponível</span>`;
      return;
    }
    const diff = delta === 0 ? 'sem alteração' : `${delta > 0 ? '+' : '−'}${OT.number(Math.abs(delta))} ${unit}`;
    preview.innerHTML = `Saldo atual <strong>${OT.number(part.saldo_atual)} ${unit}</strong> <span class="arrow" aria-hidden="true">→</span><span class="sr-only">passa para</span> novo saldo <strong>${OT.number(result)} ${unit}</strong> <span class="badge plain ${delta > 0 ? 'ok' : delta < 0 ? 'danger' : 'neutral'}">${diff}</span>`;
  }

  async function openForm(idPeca = null) {
    form.reset();
    showFormError('');
    try {
      await loadParts();
    } catch (error) {
      OT.toast(error.message, 'error');
      return;
    }
    if (state.parts.length === 0) {
      OT.toast('Não há peças ativas para movimentar. Cadastre ou ative uma peça em Estoque.', 'info');
      return;
    }
    if (idPeca && state.parts.some((part) => part.id_peca === idPeca)) partSelect.value = String(idPeca);
    updateForm();
    OT.openModal(dialog);
    (partSelect.value ? quantityInput : partSelect).focus();
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    showFormError('');
    const type = currentType();
    const { part, value, result } = computeResult();
    if (!part) return showFormError('Selecione a peça.');
    if (value === null || !Number.isInteger(value)) return showFormError('Informe a quantidade com um número inteiro.');
    if (type !== 'AJUSTE' && value <= 0) return showFormError('A quantidade deve ser maior que zero.');
    if (type === 'AJUSTE' && value < 0) return showFormError('O saldo contado não pode ser negativo.');
    if (type === 'SAIDA' && result < 0) return showFormError(`Saída maior que o saldo disponível (${part.saldo_atual} ${part.unidade}).`);
    if (type === 'AJUSTE' && result === part.saldo_atual) return showFormError('O saldo contado é igual ao saldo atual; não há ajuste a registrar.');
    if (FORM_TYPES[type].required && !reasonSelect.value) return showFormError('Selecione o motivo.');

    const body = {
      id_peca: part.id_peca,
      tipo: type,
      justificativa: reasonSelect.value,
      observacao: form.elements.observacao.value.trim()
    };
    if (type === 'AJUSTE') body.saldo_contado = value;
    else body.quantidade = value;

    const submit = $('#movement-submit');
    submit.disabled = true;
    try {
      const payload = await OT.api('/api/estoque/movimentos', { method: 'POST', body });
      OT.closeModal(dialog);
      OT.toast(`${OTMovimento.TIPOS[type].nome} registrada. ${part.nome}: saldo de ${payload.saldo_anterior} para ${payload.saldo_atual} ${part.unidade}.`.replace('Ajuste registrada', 'Ajuste registrado'));
      state.page = 1;
      await Promise.all([loadSummary(), loadMovements()]);
    } catch (error) {
      showFormError(error.message);
      await loadParts().catch(() => {});
      updatePreview();
    } finally {
      submit.disabled = false;
    }
    return undefined;
  });

  for (const radio of form.querySelectorAll('input[name="tipo"]')) radio.addEventListener('change', updateForm);
  partSelect.addEventListener('change', updatePreview);
  quantityInput.addEventListener('input', updatePreview);

  const applyFilters = () => { state.page = 1; loadMovements(); };
  filters.search.addEventListener('input', OT.debounce(applyFilters));
  filters.os.addEventListener('input', OT.debounce(applyFilters));
  for (const key of ['tipo', 'de', 'ate', 'responsavel']) filters[key].addEventListener('change', applyFilters);
  $('#clear-filters').addEventListener('click', () => {
    for (const element of Object.values(filters)) element.value = '';
    state.partFilter = null;
    window.history.replaceState(null, '', window.location.pathname);
    applyFilters();
  });
  $('#new-button').addEventListener('click', () => openForm(state.partFilter));

  try {
    await loadParts();
    await Promise.all([loadSummary(), loadMovements()]);
  } catch (error) {
    OT.toast(error.message, 'error');
  }
  if (window.location.hash === '#nova') openForm(state.partFilter);
})();
