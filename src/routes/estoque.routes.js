const express = require('express');
const { getPool } = require('../config/database');
const { authenticate, requireRoles } = require('../middleware/auth.middleware');

const router = express.Router();

router.use(authenticate, requireRoles('ADMINISTRADOR', 'ATENDENTE'));

router.get('/movimentos', async (request, response, next) => {
  try {
    const idPeca = request.query.id_peca !== undefined && request.query.id_peca !== null && String(request.query.id_peca).trim() !== ''
      ? Number(request.query.id_peca)
      : null;

    if (idPeca !== null && (!Number.isInteger(idPeca) || idPeca <= 0)) {
      return response.status(400).json({ error: 'Informe uma peça válida.' });
    }

    const filters = [];
    const params = [];

    if (idPeca !== null) {
      filters.push('m.id_peca = ?');
      params.push(idPeca);
    }

    const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

    const [rows] = await getPool().execute(
      `SELECT m.id_movimento,
              m.id_peca,
              p.nome AS peca_nome,
              p.codigo AS peca_codigo,
              m.id_os_peca,
              m.registrado_por,
              u.nome AS registrado_por_nome,
              m.quantidade_delta,
              m.motivo,
              m.criado_em,
              m.observacao
       FROM movimentos_estoque AS m
       JOIN pecas AS p ON p.id_peca = m.id_peca
       JOIN usuarios AS u ON u.id_usuario = m.registrado_por
       ${whereClause}
       ORDER BY m.criado_em DESC`,
      params
    );

    return response.json({ movimentos: rows });
  } catch (error) {
    return next(error);
  }
});

router.post('/movimentos', async (request, response, next) => {
  let connection;
  try {
    const idPeca = Number(request.body?.id_peca);
    const quantidadeDelta = Number(request.body?.quantidade_delta);
    const motivo = typeof request.body?.motivo === 'string' ? request.body.motivo.trim().toUpperCase() : '';
    const observacao = typeof request.body?.observacao === 'string' ? request.body.observacao.trim() : null;
    const idOsPeca = request.body?.id_os_peca !== undefined && request.body?.id_os_peca !== null
      ? Number(request.body.id_os_peca)
      : null;

    if (!Number.isInteger(idPeca) || idPeca <= 0) {
      return response.status(400).json({ error: 'Informe uma peça válida.' });
    }

    if (!Number.isInteger(quantidadeDelta) || quantidadeDelta === 0) {
      return response.status(400).json({ error: 'Informe uma quantidade delta válida.' });
    }

    if (!['ENTRADA', 'CONSUMO_OS', 'AJUSTE', 'ESTORNO'].includes(motivo)) {
      return response.status(400).json({ error: 'Informe um motivo válido para o movimento.' });
    }

    if (['CONSUMO_OS', 'ESTORNO'].includes(motivo)) {
      return response.status(400).json({ error: 'Consumos e estornos devem ser registrados pelo fluxo da ordem de serviço.' });
    }

    if (motivo === 'ENTRADA' && quantidadeDelta <= 0) {
      return response.status(400).json({ error: 'Entradas devem aumentar o estoque.' });
    }

    if (idOsPeca !== null && (!Number.isInteger(idOsPeca) || idOsPeca <= 0)) {
      return response.status(400).json({ error: 'Informe um item da ordem válido.' });
    }

    if (idOsPeca !== null) {
      return response.status(400).json({ error: 'Movimentos vinculados a uma ordem são gerados pelo fluxo da ordem de serviço.' });
    }

    connection = await getPool().getConnection();
    await connection.beginTransaction();

    const [pecaRows] = await connection.execute(
      'SELECT id_peca FROM pecas WHERE id_peca = ? LIMIT 1 FOR UPDATE',
      [idPeca]
    );
    if (pecaRows.length === 0) {
      await connection.rollback();
      return response.status(404).json({ error: 'Peça não encontrada.' });
    }

    const [balanceRows] = await connection.execute(
      'SELECT COALESCE(SUM(quantidade_delta), 0) AS saldo_atual FROM movimentos_estoque WHERE id_peca = ?',
      [idPeca]
    );
    const saldoAtual = Number(balanceRows[0].saldo_atual);
    if (saldoAtual + quantidadeDelta < 0) {
      await connection.rollback();
      return response.status(409).json({ error: 'O movimento não pode deixar o estoque negativo.', saldo_disponivel: saldoAtual });
    }

    const [result] = await connection.execute(
      `INSERT INTO movimentos_estoque (
        id_peca, id_os_peca, registrado_por, quantidade_delta, motivo, observacao
      ) VALUES (?, ?, ?, ?, ?, ?)` ,
      [idPeca, idOsPeca, request.user.id_usuario, quantidadeDelta, motivo, observacao || null]
    );

    const [rows] = await connection.execute(
      `SELECT m.id_movimento,
              m.id_peca,
              p.nome AS peca_nome,
              p.codigo AS peca_codigo,
              m.id_os_peca,
              m.registrado_por,
              u.nome AS registrado_por_nome,
              m.quantidade_delta,
              m.motivo,
              m.criado_em,
              m.observacao
       FROM movimentos_estoque AS m
       JOIN pecas AS p ON p.id_peca = m.id_peca
       JOIN usuarios AS u ON u.id_usuario = m.registrado_por
       WHERE m.id_movimento = ?
       LIMIT 1`,
      [result.insertId]
    );

    await connection.commit();
    return response.status(201).json({ movimento: rows[0] });
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    return next(error);
  } finally {
    connection?.release();
  }
});

module.exports = router;
