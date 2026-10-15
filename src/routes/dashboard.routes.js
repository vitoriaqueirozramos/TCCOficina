const express = require('express');
const { getPool } = require('../config/database');
const { authenticate, requireRoles } = require('../middleware/auth.middleware');

const router = express.Router();

router.use(authenticate, requireRoles('ADMINISTRADOR', 'ATENDENTE'));

router.get('/summary', async (_request, response, next) => {
  try {
    const [osSummary] = await getPool().execute(
      `SELECT
         SUM(CASE WHEN s.codigo = 'ABERTA' THEN 1 ELSE 0 END) AS os_abertas,
         SUM(CASE WHEN s.codigo = 'EM_EXECUCAO' THEN 1 ELSE 0 END) AS os_em_execucao,
         SUM(CASE WHEN s.codigo = 'AGUARDANDO_PECAS' THEN 1 ELSE 0 END) AS os_aguardando_pecas
       FROM ordens_servico AS os
       JOIN status_os AS s ON s.id_status_os = os.id_status_os`
    );

    const [stockSummary] = await getPool().execute(
      `SELECT COUNT(*) AS pecas_abaixo_minimo
       FROM pecas AS p
       LEFT JOIN (
         SELECT id_peca, SUM(quantidade_delta) AS saldo
         FROM movimentos_estoque
         GROUP BY id_peca
       ) AS m ON m.id_peca = p.id_peca
       WHERE p.ativo = TRUE AND COALESCE(m.saldo, 0) < p.estoque_minimo`
    );

    const summary = {
      os_abertas: Number(osSummary[0]?.os_abertas || 0),
      os_em_execucao: Number(osSummary[0]?.os_em_execucao || 0),
      os_aguardando_pecas: Number(osSummary[0]?.os_aguardando_pecas || 0),
      pecas_abaixo_minimo: Number(stockSummary[0]?.pecas_abaixo_minimo || 0)
    };

    return response.json({ summary });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
