// Formulário de peça, usado nas telas Peças e Estoque (uma única definição dos campos).
window.OTPecaForm = {
  fieldsHtml: `
    <div class="form-grid">
      <div class="field">
        <label for="f-codigo">Código</label>
        <input id="f-codigo" name="codigo" type="text" maxlength="40" placeholder="FRE-001" required autocomplete="off">
      </div>
      <div class="field">
        <label for="f-nome">Nome</label>
        <input id="f-nome" name="nome" type="text" maxlength="120" required autocomplete="off">
      </div>
      <div class="field">
        <label for="f-categoria">Categoria</label>
        <input id="f-categoria" name="categoria" type="text" maxlength="40" list="categorias" required autocomplete="off">
        <datalist id="categorias"></datalist>
      </div>
      <div class="field">
        <label for="f-unidade">Unidade de medida</label>
        <select id="f-unidade" name="unidade" required>
          <option value="UN">UN (unidade)</option>
          <option value="PAR">PAR (par)</option>
          <option value="JG">JG (jogo)</option>
          <option value="KIT">KIT (kit)</option>
          <option value="CX">CX (caixa)</option>
          <option value="L">L (litro)</option>
          <option value="M">M (metro)</option>
        </select>
      </div>
      <div class="field">
        <label for="f-custo">Preço de custo (R$)</label>
        <input id="f-custo" name="preco_custo" type="number" min="0" step="0.01" required>
      </div>
      <div class="field">
        <label for="f-venda">Preço de venda (R$)</label>
        <input id="f-venda" name="preco_atual" type="number" min="0" step="0.01" required>
      </div>
      <div class="field">
        <label for="f-minimo">Estoque mínimo</label>
        <input id="f-minimo" name="estoque_minimo" type="number" min="0" step="1" required>
        <span class="hint">Abaixo desta quantidade a peça entra na lista de reposição.</span>
      </div>
    </div>
    <div class="field">
      <label for="f-descricao">Descrição <span class="optional">(opcional)</span></label>
      <textarea id="f-descricao" name="descricao" rows="2"></textarea>
    </div>`,

  mount() {
    document.querySelector('#peca-fields').innerHTML = this.fieldsHtml;
  },

  async prepare(form) {
    const { categorias } = await OT.api('/api/pecas/categorias');
    document.querySelector('#categorias').innerHTML = categorias.map((categoria) => `<option value="${OT.esc(categoria)}"></option>`).join('');
    form.elements.unidade.value = 'UN';
  },

  fill(form, peca) {
    form.elements.codigo.value = peca.codigo;
    form.elements.nome.value = peca.nome;
    form.elements.categoria.value = peca.categoria || '';
    form.elements.unidade.value = peca.unidade || 'UN';
    form.elements.preco_custo.value = Number(peca.preco_custo || 0).toFixed(2);
    form.elements.preco_atual.value = Number(peca.preco_atual || 0).toFixed(2);
    form.elements.estoque_minimo.value = peca.estoque_minimo ?? 0;
    form.elements.descricao.value = peca.descricao || '';
  },

  read(form) {
    const data = Object.fromEntries(new FormData(form));
    if (!data.codigo.trim() || !data.nome.trim()) throw new Error('Informe o código e o nome da peça.');
    if (!data.categoria.trim()) throw new Error('Informe a categoria da peça.');
    if (data.preco_atual === '' || Number(data.preco_atual) < 0) throw new Error('Informe um preço de venda válido.');
    if (data.preco_custo === '' || Number(data.preco_custo) < 0) throw new Error('Informe um preço de custo válido.');
    if (data.estoque_minimo === '' || !Number.isInteger(Number(data.estoque_minimo)) || Number(data.estoque_minimo) < 0) {
      throw new Error('Informe o estoque mínimo como número inteiro.');
    }
    return {
      codigo: data.codigo,
      nome: data.nome,
      categoria: data.categoria,
      unidade: data.unidade,
      preco_custo: Number(data.preco_custo),
      preco_atual: Number(data.preco_atual),
      estoque_minimo: Number(data.estoque_minimo),
      descricao: data.descricao
    };
  }
};
