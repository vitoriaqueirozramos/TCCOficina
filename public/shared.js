// OFICINATECH — base comum das telas: menu, sessão, chamadas à API, modais, avisos e cadastros.
(function () {
  'use strict';

  const ICONS = {
    marca: '<path d="M12 2 20.7 7v10L12 22 3.3 17V7z"/><circle cx="12" cy="12" r="3.6"/>',
    painel: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
    os: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 12h6M9 16h6"/>',
    clientes: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    veiculos: '<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9L18 10l-2.7-4.2A2 2 0 0 0 13.6 5H7.4a2 2 0 0 0-1.7.9L3 10l-1 1v5c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/>',
    mecanicos: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
    servicos: '<path d="m3 17 2 2 4-4M3 7l2 2 4-4M13 6h8M13 12h8M13 18h8"/>',
    pecas: '<circle cx="12" cy="12" r="3"/><path d="M12 2l2.2 2.6 3.3-.6.9 3.2 3 1.5-1.2 3.3 1.2 3.3-3 1.5-.9 3.2-3.3-.6L12 22l-2.2-2.6-3.3.6-.9-3.2-3-1.5L3.8 12 2.6 8.7l3-1.5.9-3.2 3.3.6z"/>',
    estoque: '<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.3 7 12 12l8.7-5M12 22V12"/>',
    movimentos: '<path d="M7 4v16M3 8l4-4 4 4M17 20V4M13 16l4 4 4-4"/>',
    sair: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    fechar: '<path d="M18 6 6 18M6 6l12 12"/>',
    busca: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
    mais: '<path d="M12 5v14M5 12h14"/>',
    alerta: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01"/>',
    entrada: '<circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12l4 4 4-4"/>',
    saida: '<circle cx="12" cy="12" r="10"/><path d="M12 16V8M8 12l4-4 4 4"/>',
    ajuste: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
    vazio: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1z"/>',
    dinheiro: '<path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
    voltar: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
    atualizar: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5"/>',
    pessoa: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    check: '<path d="M20 6 9 17l-5-5"/>'
  };

  const NAV = [
    { group: 'Oficina' },
    { id: 'painel', label: 'Visão geral', href: '/', icon: 'painel' },
    { id: 'ordens', label: 'Ordens de serviço', href: '/ordens-servico.html', icon: 'os' },
    { group: 'Cadastros' },
    { id: 'clientes', label: 'Clientes', href: '/clientes.html', icon: 'clientes' },
    { id: 'veiculos', label: 'Veículos', href: '/veiculos.html', icon: 'veiculos' },
    { id: 'mecanicos', label: 'Mecânicos', href: '/mecanicos.html', icon: 'mecanicos' },
    { id: 'servicos', label: 'Serviços', href: '/servicos.html', icon: 'servicos' },
    { id: 'pecas', label: 'Peças', href: '/pecas.html', icon: 'pecas' },
    { group: 'Estoque' },
    { id: 'estoque', label: 'Estoque', href: '/estoque.html', icon: 'estoque' },
    { id: 'movimentacoes', label: 'Movimentações', href: '/movimentacoes.html', icon: 'movimentos' }
  ];

  const PERFIS = { ADMINISTRADOR: 'Administrador', ATENDENTE: 'Atendente', MECANICO: 'Mecânico' };
  const STATUS_CLASS = {
    ABERTA: 'petroleo',
    EM_DIAGNOSTICO: 'info',
    AGUARDANDO_APROVACAO: 'warn',
    AGUARDANDO_PECAS: 'warn',
    EM_EXECUCAO: 'info',
    CONCLUIDA: 'ok',
    CANCELADA: 'neutral'
  };

  const moneyFormat = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const numberFormat = new Intl.NumberFormat('pt-BR');
  const dateTimeFormat = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  const dateFormat = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' });

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
  }

  function icon(name, extraClass = '') {
    return `<svg class="icon ${extraClass}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[name] || ''}</svg>`;
  }

  // Troca os marcadores <span data-icon="nome"> do HTML pelos ícones.
  function hydrateIcons(root = document) {
    for (const holder of root.querySelectorAll('span[data-icon]')) {
      holder.outerHTML = icon(holder.dataset.icon);
    }
  }

  // O MySQL devolve BOOLEAN como 1/0; a interface trata 1, "1", true e "true" como verdadeiro.
  function toBool(value) {
    return value === true || value === 1 || value === '1' || value === 'true';
  }

  function validDate(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const money = (value) => moneyFormat.format(Number(value || 0));
  const number = (value) => numberFormat.format(Number(value || 0));
  const dateTime = (value, fallback = '—') => { const date = validDate(value); return date ? dateTimeFormat.format(date) : fallback; };
  const date = (value, fallback = '—') => { const parsed = validDate(value); return parsed ? dateFormat.format(parsed) : fallback; };

  function duration(minutes) {
    const total = Number(minutes);
    if (!Number.isFinite(total) || total <= 0) return '—';
    const hours = Math.floor(total / 60);
    const rest = total % 60;
    if (hours === 0) return `${rest} min`;
    return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
  }

  function debounce(callback, wait = 280) {
    let timer;
    return (...parameters) => {
      clearTimeout(timer);
      timer = setTimeout(() => callback(...parameters), wait);
    };
  }

  async function api(url, options = {}) {
    const init = { method: options.method || 'GET', credentials: 'same-origin', headers: {} };
    if (options.body !== undefined) {
      init.headers['content-type'] = 'application/json';
      init.body = JSON.stringify(options.body);
    }

    let response;
    try {
      response = await fetch(url, init);
    } catch {
      throw new Error('Não foi possível conectar ao servidor. Verifique se a aplicação está em execução.');
    }
    if (response.status === 204) return null;

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    if (response.status === 401 && !options.allowUnauthorized) {
      window.location.replace('/login.html');
      throw new Error('Sessão encerrada. Entre novamente.');
    }
    if (!response.ok) {
      const error = new Error(payload?.error || 'Não foi possível concluir a operação.');
      error.status = response.status;
      error.payload = payload;
      throw error;
    }
    if (payload === null || typeof payload !== 'object') {
      throw new Error('O servidor devolveu uma resposta inválida.');
    }
    return payload;
  }

  function query(params) {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') search.set(key, value);
    }
    const text = search.toString();
    return text ? `?${text}` : '';
  }

  // ---- Avisos -------------------------------------------------------------------------------
  let toastRegion;
  function toast(message, type = 'success') {
    if (!toastRegion) {
      toastRegion = document.createElement('div');
      toastRegion.className = 'toast-region';
      toastRegion.setAttribute('role', 'status');
      toastRegion.setAttribute('aria-live', 'polite');
      document.body.append(toastRegion);
    }
    const item = document.createElement('div');
    item.className = `toast ${type === 'success' ? '' : type}`.trim();
    item.textContent = message;
    toastRegion.append(item);
    setTimeout(() => item.remove(), type === 'error' ? 7000 : 4500);
  }

  // ---- Diálogos -----------------------------------------------------------------------------
  function openModal(dialog) {
    if (!dialog.open) dialog.showModal();
  }

  function closeModal(dialog) {
    if (dialog.open) dialog.close();
  }

  function wireModals(root = document) {
    for (const button of root.querySelectorAll('[data-close-modal]')) {
      button.addEventListener('click', () => closeModal(button.closest('dialog')));
    }
    for (const dialog of root.querySelectorAll('dialog.modal')) {
      // Clique fora do conteúdo fecha o diálogo.
      dialog.addEventListener('click', (event) => {
        if (event.target === dialog) closeModal(dialog);
      });
    }
  }

  let confirmDialog;
  function confirmAction({ title, message, confirmLabel = 'Confirmar', danger = false }) {
    if (!confirmDialog) {
      confirmDialog = document.createElement('dialog');
      confirmDialog.className = 'modal narrow';
      confirmDialog.innerHTML = `
        <div class="modal-header"><h2 data-role="title"></h2></div>
        <div class="modal-body">
          <p class="modal-text" data-role="message"></p>
          <div class="form-actions">
            <button type="button" class="btn btn-secondary" data-role="cancel">Cancelar</button>
            <button type="button" class="btn" data-role="confirm"></button>
          </div>
        </div>`;
      document.body.append(confirmDialog);
    }
    const confirmButton = confirmDialog.querySelector('[data-role="confirm"]');
    confirmDialog.querySelector('[data-role="title"]').textContent = title;
    confirmDialog.querySelector('[data-role="message"]').textContent = message;
    confirmButton.textContent = confirmLabel;
    confirmButton.className = `btn ${danger ? 'btn-danger' : 'btn-primary'}`;

    return new Promise((resolve) => {
      const finish = (answer) => {
        confirmDialog.removeEventListener('close', onClose);
        confirmButton.removeEventListener('click', onConfirm);
        cancelButton.removeEventListener('click', onCancel);
        closeModal(confirmDialog);
        resolve(answer);
      };
      const cancelButton = confirmDialog.querySelector('[data-role="cancel"]');
      const onConfirm = () => finish(true);
      const onCancel = () => finish(false);
      const onClose = () => finish(false);
      confirmButton.addEventListener('click', onConfirm);
      cancelButton.addEventListener('click', onCancel);
      confirmDialog.addEventListener('close', onClose);
      openModal(confirmDialog);
      cancelButton.focus();
    });
  }

  // ---- Componentes de texto -----------------------------------------------------------------
  function statusBadge(codigo, nome) {
    return `<span class="badge ${STATUS_CLASS[codigo] || 'neutral'}">${esc(nome || codigo)}</span>`;
  }

  function activeBadge(value) {
    return toBool(value) ? '<span class="badge ok">Ativo</span>' : '<span class="badge neutral">Inativo</span>';
  }

  function plate(value) {
    return value ? `<span class="plate"><span>${esc(value)}</span></span>` : '—';
  }

  function stateRow(columns, { iconName = 'vazio', title, text = '' }) {
    return `<tr><td class="state" colspan="${columns}">${icon(iconName)}<h3>${esc(title)}</h3><p>${esc(text)}</p></td></tr>`;
  }

  function loadingRow(columns) {
    return `<tr><td class="state" colspan="${columns}"><span class="loading"><span class="spinner"></span>Carregando…</span></td></tr>`;
  }

  function fillSelect(select, items, { value, label, placeholder, selected } = {}) {
    const options = items.map((item) => `<option value="${esc(value(item))}">${esc(label(item))}</option>`).join('');
    select.innerHTML = (placeholder === undefined ? '' : `<option value="">${esc(placeholder)}</option>`) + options;
    if (selected !== undefined && selected !== null) select.value = String(selected);
  }

  function renderPagination(container, pagination, onChange) {
    const { page, limit, total } = pagination;
    const pages = Math.max(1, pagination.pages || 1);
    const first = total === 0 ? 0 : (page - 1) * limit + 1;
    const last = Math.min(total, page * limit);
    container.innerHTML = `
      <span>${total === 0 ? 'Nenhum registro' : `Mostrando ${first}–${last} de ${total}`}</span>
      <div class="pagination-controls">
        <button type="button" class="btn btn-secondary btn-sm" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>Anterior</button>
        <span>Página ${page} de ${pages}</span>
        <button type="button" class="btn btn-secondary btn-sm" data-page="${page + 1}" ${page >= pages ? 'disabled' : ''}>Próxima</button>
      </div>`;
    for (const button of container.querySelectorAll('button[data-page]')) {
      button.addEventListener('click', () => onChange(Number(button.dataset.page)));
    }
  }

  // ---- Menu lateral e sessão ----------------------------------------------------------------
  function brandHtml() {
    return `<a class="brand" href="/" aria-label="OFICINATECH, visão geral">
      <svg class="brand-mark icon" viewBox="0 0 24 24" aria-hidden="true">${ICONS.marca}</svg>
      <span class="brand-name">OFICINA<span>TECH</span><span class="brand-sub">Gestão de oficina</span></span>
    </a>`;
  }

  async function logout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    } finally {
      window.location.assign('/login.html');
    }
  }

  function buildShell(user, activePage) {
    const initials = user.nome.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
    const links = NAV.map((item) => (item.group
      ? `<p class="nav-group">${item.group}</p>`
      : `<a class="nav-link ${item.id === activePage ? 'is-active' : ''}" href="${item.href}" ${item.id === activePage ? 'aria-current="page"' : ''}>${icon(item.icon)}<span>${item.label}</span></a>`
    )).join('');

    const sidebar = document.createElement('aside');
    sidebar.className = 'sidebar';
    sidebar.id = 'menu-lateral';
    sidebar.setAttribute('aria-label', 'Navegação principal');
    sidebar.innerHTML = `${brandHtml()}
      <nav class="nav">${links}</nav>
      <div class="sidebar-user">
        <span class="avatar" aria-hidden="true">${esc(initials)}</span>
        <span class="sidebar-user-text">
          <span class="sidebar-user-name">${esc(user.nome)}</span>
          <span class="sidebar-user-role">${esc(PERFIS[user.perfil] || user.perfil)}</span>
        </span>
        <button type="button" class="icon-button" id="logout-button" aria-label="Sair do sistema" title="Sair">${icon('sair')}</button>
      </div>`;

    const mobileBar = document.createElement('div');
    mobileBar.className = 'mobile-bar';
    mobileBar.innerHTML = `<button type="button" class="icon-button" id="menu-toggle" aria-label="Abrir menu" aria-controls="menu-lateral" aria-expanded="false">${icon('menu')}</button>${brandHtml()}`;

    const backdrop = document.createElement('div');
    backdrop.className = 'sidebar-backdrop';

    const skip = document.createElement('a');
    skip.className = 'skip-link';
    skip.href = '#conteudo';
    skip.textContent = 'Ir para o conteúdo';

    document.body.prepend(skip, mobileBar, sidebar, backdrop);

    const toggle = mobileBar.querySelector('#menu-toggle');
    const setMenu = (open) => {
      document.body.classList.toggle('menu-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
    };
    toggle.addEventListener('click', () => setMenu(!document.body.classList.contains('menu-open')));
    backdrop.addEventListener('click', () => setMenu(false));
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') setMenu(false);
    });
    sidebar.querySelector('#logout-button').addEventListener('click', logout);
  }

  // Confere a sessão, monta o menu e devolve o usuário. Mecânicos vão para a área própria.
  async function initPage(activePage) {
    let payload;
    try {
      payload = await api('/api/auth/me');
    } catch {
      return null;
    }
    if (payload.user.perfil === 'MECANICO') {
      window.location.replace('/mecanico.html');
      return null;
    }
    hydrateIcons();
    buildShell(payload.user, activePage);
    wireModals();
    return payload.user;
  }

  // ---- Telas de cadastro (lista com pesquisa, filtro, paginação, formulário em diálogo) ------
  function crud(config) {
    const elements = {
      rows: document.querySelector('#rows'),
      search: document.querySelector('#search'),
      filter: document.querySelector('#filter-ativo'),
      pagination: document.querySelector('#pagination'),
      newButton: document.querySelector('#new-button'),
      dialog: document.querySelector('#form-dialog'),
      form: document.querySelector('#form'),
      title: document.querySelector('#form-title'),
      error: document.querySelector('#form-error'),
      submit: document.querySelector('#form-submit')
    };
    const columnCount = config.columns.length + 2;
    const state = { page: 1, items: [], editing: null };

    const showFormError = (message) => {
      elements.error.textContent = message || '';
      elements.error.hidden = !message;
    };

    async function load() {
      elements.rows.innerHTML = loadingRow(columnCount);
      try {
        const payload = await api(`/api/${config.resource}${query({
          q: elements.search.value.trim(),
          ativo: elements.filter.value,
          page: state.page,
          limit: config.pageSize || 10,
          ...(config.extraParams ? config.extraParams() : {})
        })}`);
        state.items = payload[config.listKey] || [];
        state.page = payload.pagination.page;
        if (state.items.length === 0 && state.page > 1) {
          state.page -= 1;
          return load();
        }
        renderPagination(elements.pagination, payload.pagination, (page) => { state.page = page; load(); });
        if (state.items.length === 0) {
          const filtered = elements.search.value.trim() || elements.filter.value !== 'all';
          elements.rows.innerHTML = stateRow(columnCount, {
            title: config.feminine ? `Nenhuma ${config.singular} encontrada` : `Nenhum ${config.singular} encontrado`,
            text: filtered ? 'Ajuste a pesquisa ou o filtro de situação.' : `Use o botão "${elements.newButton.textContent.trim()}" para cadastrar.`
          });
          return undefined;
        }
        elements.rows.innerHTML = state.items.map((item) => {
          const active = toBool(item.ativo);
          const cells = config.columns.map((column) => `<td data-label="${esc(column.label)}" class="${column.className || ''}">${column.render(item)}</td>`).join('');
          return `<tr class="${active ? '' : 'is-inactive'}">
            ${cells}
            <td data-label="Situação">${activeBadge(item.ativo)}</td>
            <td class="actions">
              <button type="button" class="btn btn-secondary btn-sm" data-action="edit" data-id="${esc(item[config.idKey])}">Editar</button>
              <button type="button" class="btn ${active ? 'btn-danger' : 'btn-secondary'} btn-sm" data-action="toggle" data-id="${esc(item[config.idKey])}">${active ? 'Inativar' : 'Ativar'}</button>
            </td>
          </tr>`;
        }).join('');
      } catch (error) {
        elements.rows.innerHTML = stateRow(columnCount, { iconName: 'alerta', title: 'Não foi possível carregar a lista', text: error.message });
      }
      return undefined;
    }

    async function openForm(item) {
      state.editing = item;
      elements.form.reset();
      showFormError('');
      elements.title.textContent = item ? `Editar ${config.singular}` : `${config.feminine ? 'Nova' : 'Novo'} ${config.singular}`;
      elements.submit.textContent = item ? 'Salvar alterações' : `Cadastrar ${config.singular}`;
      try {
        if (config.beforeOpen) await config.beforeOpen(elements.form, item);
        if (item) config.fill(elements.form, item);
      } catch (error) {
        toast(error.message, 'error');
        return;
      }
      openModal(elements.dialog);
      const first = elements.form.querySelector('input:not([type="hidden"]):not(:disabled), select:not(:disabled), textarea:not(:disabled)');
      first?.focus();
    }

    async function toggle(item) {
      const active = toBool(item.ativo);
      const name = config.itemName(item);
      if (active) {
        const confirmed = await confirmAction({
          title: `Inativar ${config.singular}`,
          message: `${name} deixará de aparecer nas seleções de novos lançamentos. O histórico é mantido e o cadastro pode ser ativado de novo.`,
          confirmLabel: 'Inativar',
          danger: true
        });
        if (!confirmed) return;
      }
      try {
        const payload = await api(`/api/${config.resource}/${item[config.idKey]}/ativo`, { method: 'PATCH', body: { ativo: !active } });
        const updated = payload[config.itemKey];
        if (!updated || toBool(updated.ativo) !== !active) {
          throw new Error('O servidor não confirmou a alteração de situação.');
        }
        toast(payload.message || (active ? 'Cadastro inativado.' : 'Cadastro ativado.'));
      } catch (error) {
        toast(error.message, 'error');
      }
      await load();
    }

    elements.rows.addEventListener('click', async (event) => {
      const button = event.target.closest('button[data-action]');
      if (!button) return;
      const item = state.items.find((entry) => String(entry[config.idKey]) === button.dataset.id);
      if (!item) return;
      button.disabled = true;
      try {
        if (button.dataset.action === 'edit') await openForm(item);
        else await toggle(item);
      } finally {
        button.disabled = false;
      }
    });

    elements.form.addEventListener('submit', async (event) => {
      event.preventDefault();
      showFormError('');
      let body;
      try {
        body = config.read(elements.form);
      } catch (error) {
        showFormError(error.message);
        return;
      }
      elements.submit.disabled = true;
      try {
        const editing = state.editing;
        await api(editing ? `/api/${config.resource}/${editing[config.idKey]}` : `/api/${config.resource}`, {
          method: editing ? 'PUT' : 'POST',
          body
        });
        closeModal(elements.dialog);
        toast(editing ? 'Alterações salvas.' : `Cadastro de ${config.singular} concluído.`);
        await load();
      } catch (error) {
        showFormError(error.message);
      } finally {
        elements.submit.disabled = false;
      }
    });

    elements.newButton.addEventListener('click', () => openForm(null));
    elements.search.addEventListener('input', debounce(() => { state.page = 1; load(); }));
    elements.filter.addEventListener('change', () => { state.page = 1; load(); });

    return { load, openForm };
  }

  window.OT = {
    api, query, esc, icon, hydrateIcons, toBool, money, number, dateTime, date, duration, debounce,
    toast, openModal, closeModal, wireModals, confirmAction,
    statusBadge, activeBadge, plate, stateRow, loadingRow, fillSelect, renderPagination,
    initPage, logout, brandHtml, crud, PERFIS
  };
}());
