// Saldo de estoque: a view vw_saldo_estoque é a única fonte do cálculo (soma dos movimentos).

// Bloqueia a peça dentro da transação e devolve o cadastro com o saldo atual.
// Deve ser chamada antes de qualquer movimento, para que duas operações simultâneas
// sobre a mesma peça sejam avaliadas em sequência.
async function lockPartWithBalance(connection, idPeca) {
  const [partRows] = await connection.execute(
    'SELECT id_peca, codigo, nome, ativo FROM pecas WHERE id_peca = ? LIMIT 1 FOR UPDATE',
    [idPeca]
  );
  if (partRows.length === 0) {
    return null;
  }

  const [balanceRows] = await connection.execute(
    'SELECT saldo_atual FROM vw_saldo_estoque WHERE id_peca = ?',
    [idPeca]
  );
  return { ...partRows[0], ativo: Boolean(partRows[0].ativo), saldo_atual: Number(balanceRows[0]?.saldo_atual ?? 0) };
}

module.exports = { lockPartWithBalance };
