const express = require('express');
const { getPool } = require('../config/database');
const { authenticate, requireRoles } = require('../middleware/auth.middleware');

const router = express.Router();

router.use(authenticate, requireRoles('ADMINISTRADOR', 'ATENDENTE'));

router.get('/summary', async (_request, response, next) => {
  try {
    const pool = getPool();
    const [statusRows] = await pool.execute(
      `SELECT s.codigo, s.nome, COUNT(os.id_os) AS total
       FROM status_os AS s
       LEFT JOIN ordens_servico AS os ON os.id_status_os = s.id_status_os
       GROUP BY s.id_status_os, s.codigo, s.nome
       ORDER BY s.id_status_os`
    );
    const porStatus = Object.fromEntries(statusRows.map((row) => [row.codigo, Number(row.total)]));

    const [[cadastros]] = await pool.execute(
      `SELECT (SELECT COUNT(*) FROM clientes) AS clientes_cadastrados,
              (SELECT COUNT(*) FROM clientes WHERE ativo = TRUE) AS clientes_ativos,
              (SELECT COUNT(*) FROM veiculos WHERE ativo = TRUE) AS veiculos_ativos,
              (SELECT COUNT(*) FROM mecanicos WHERE ativo = TRUE) AS mecanicos_ativos,
              (SELECT COUNT(*) FROM mecanicos) AS mecanicos_cadastrados`
    );
    const [[estoque]] = await pool.execute(
      `SELECT COUNT(*) AS pecas_em_estoque,
              COALESCE(SUM(saldo_atual), 0) AS unidades_em_estoque,
              COALESCE(SUM(saldo_atual < estoque_minimo), 0) AS pecas_abaixo_minimo,
              COALESCE(SUM(situacao = 'SEM_ESTOQUE'), 0) AS pecas_sem_estoque
       FROM vw_saldo_estoque
       WHERE ativo = TRUE`
    );
    const [reposicao] = await pool.execute(
      `SELECT id_peca, codigo, nome, unidade, saldo_atual, estoque_minimo, situacao
       FROM vw_saldo_estoque
       WHERE ativo = TRUE AND situacao <> 'DISPONIVEL'
       ORDER BY saldo_atual ASC, nome ASC
       LIMIT 6`
    );
    const [equipe] = await pool.execute(
      `SELECT m.id_mecanico, u.nome, m.especialidade,
              COALESCE(SUM(st.codigo NOT IN ('CONCLUIDA', 'CANCELADA')), 0) AS ordens_em_andamento
       FROM mecanicos AS m
       JOIN usuarios AS u ON u.id_usuario = m.id_usuario
       LEFT JOIN ordens_servico AS os ON os.id_mecanico = m.id_mecanico
       LEFT JOIN status_os AS st ON st.id_status_os = os.id_status_os
       WHERE m.ativo = TRUE
       GROUP BY m.id_mecanico, u.nome, m.especialidade
       ORDER BY ordens_em_andamento DESC, u.nome ASC`
    );
    const [[semResponsavel]] = await pool.execute(
      `SELECT COUNT(*) AS total
       FROM ordens_servico AS os JOIN status_os AS st ON st.id_status_os = os.id_status_os
       WHERE os.id_mecanico IS NULL AND st.codigo NOT IN ('CONCLUIDA', 'CANCELADA')`
    );

    return response.json({
      summary: {
        os_abertas: porStatus.ABERTA || 0,
        os_em_execucao: porStatus.EM_EXECUCAO || 0,
        os_aguardando_pecas: porStatus.AGUARDANDO_PECAS || 0,
        os_em_diagnostico: porStatus.EM_DIAGNOSTICO || 0,
        os_sem_responsavel: Number(semResponsavel.total),
        clientes_cadastrados: Number(cadastros.clientes_cadastrados),
        clientes_ativos: Number(cadastros.clientes_ativos),
        veiculos_ativos: Number(cadastros.veiculos_ativos),
        mecanicos_ativos: Number(cadastros.mecanicos_ativos),
        mecanicos_cadastrados: Number(cadastros.mecanicos_cadastrados),
        pecas_em_estoque: Number(estoque.pecas_em_estoque),
        unidades_em_estoque: Number(estoque.unidades_em_estoque),
        pecas_abaixo_minimo: Number(estoque.pecas_abaixo_minimo),
        pecas_sem_estoque: Number(estoque.pecas_sem_estoque)
      },
      os_por_status: statusRows.map((row) => ({ codigo: row.codigo, nome: row.nome, total: Number(row.total) })),
      reposicao,
      equipe: equipe.map((row) => ({ ...row, ordens_em_andamento: Number(row.ordens_em_andamento) }))
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
