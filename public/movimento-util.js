// Apresentação das movimentações de estoque, usada em Estoque e em Movimentações.
window.OTMovimento = {
  TIPOS: {
    ENTRADA: { nome: 'Entrada', classe: 'ok' },
    SAIDA: { nome: 'Saída', classe: 'danger' },
    CONSUMO_OS: { nome: 'Saída em OS', classe: 'danger' },
    AJUSTE: { nome: 'Ajuste', classe: 'info' },
    ESTORNO: { nome: 'Estorno de OS', classe: 'ok' }
  },

  badge(motivo) {
    const tipo = this.TIPOS[motivo] || { nome: motivo, classe: 'neutral' };
    return `<span class="badge ${tipo.classe}">${OT.esc(tipo.nome)}</span>`;
  },

  // +10 UN para entradas, −3 UN para saídas e "Ajuste: +2 UN" para ajustes.
  quantidade(movimento) {
    const delta = Number(movimento.quantidade_delta);
    const unidade = OT.esc(movimento.peca_unidade || 'UN');
    const texto = `${delta > 0 ? '+' : '−'}${OT.number(Math.abs(delta))}`;
    if (movimento.motivo === 'AJUSTE') {
      return `<span class="qty adj"><small>Ajuste:</small> ${texto} <small>${unidade}</small></span>`;
    }
    return `<span class="qty ${delta > 0 ? 'pos' : 'neg'}">${texto} <small>${unidade}</small></span>`;
  },

  motivo(movimento) {
    if (movimento.justificativa) return movimento.justificativa;
    if (movimento.motivo === 'CONSUMO_OS') return 'Consumo em ordem de serviço';
    if (movimento.motivo === 'ESTORNO') return 'Devolução ao estoque';
    return '—';
  }
};
