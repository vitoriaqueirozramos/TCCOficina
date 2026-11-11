const express = require('express');
const { getPool } = require('../config/database');
const { authenticate, requireRoles } = require('../middleware/auth.middleware');
const { paginationMetadata, parseActiveFilter, parsePagination } = require('../utils/list-query');
const { lockPartWithBalance } = require('../utils/estoque');

const router = express.Router();

router.use(authenticate, requireRoles('ADMINISTRADOR', 'ATENDENTE'));

// Tipos que o usuário pode lançar manualmente. Consumos e estornos nascem no fluxo da OS.
const TIPOS_MANUAIS = ['ENTRADA', 'SAIDA', 'AJUSTE'];
// Filtro "SAIDA" da listagem reúne as saídas manuais e o consumo em ordens de serviço.
const FILTRO_TIPO = {
  ENTRADA: ['ENTRADA'],
  SAIDA: ['SAIDA', 'CONSUMO_OS'],
  AJUSTE: ['AJUSTE'],
  ESTORNO: ['ESTORNO']
};
const MOVEMENT_SELECT = `SELECT m.id_movimento, m.id_peca, p.nome AS peca_nome, p.codigo AS peca_codigo, p.unidade AS peca_unidade,
                                m.id_os_peca, op.id_os, m.registrado_por, u.nome AS registrado_por_nome,
                                m.quantidade_delta, m.motivo, m.justificativa, m.criado_em, m.observacao
                         FROM movimentos_estoque AS m
                         JOIN pecas AS p ON p.id_peca = m.id_peca
                         JOIN usuarios AS u ON u.id_usuario = m.registrado_por
                         LEFT JOIN os_pecas AS op ON op.id_os_peca = m.id_os_peca`;
const PRODUCT_SORT = {
  nome: 'nome',
  codigo: 'codigo',
  categoria: 'categoria',
  saldo: 'saldo_atual',
  minimo: 'estoque_minimo',
  preco: 'preco_atual'
};

function isDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

// Indicadores do estoque, calculados sobre as peças ativas.
router.get('/resumo', async (_request, response, next) => {
  try {
    const [[totais]] = await getPool().execute(
      `SELECT COUNT(*) AS total_produtos,
              COALESCE(SUM(situacao = 'BAIXO'), 0) AS estoque_baixo,
              COALESCE(SUM(situacao = 'SEM_ESTOQUE'), 0) AS sem_estoque,
              COALESCE(SUM(saldo_atual), 0) AS unidades,
              COALESCE(SUM(saldo_atual * preco_custo), 0) AS valor_total
       FROM vw_saldo_estoque
       WHERE ativo = TRUE`
    );
    const [categorias] = await getPool().execute('SELECT DISTINCT categoria FROM pecas ORDER BY categoria ASC');
    return response.json({
      resumo: {
        total_produtos: Number(totais.total_produtos),
        estoque_baixo: Number(totais.estoque_baixo),
        sem_estoque: Number(totais.sem_estoque),
        unidades: Number(totais.unidades),
        valor_total: Number(totais.valor_total)
      },
      categorias: categorias.map((row) => row.categoria)
    });
  } catch (error) {
    return next(error);
  }
});

// Posição de estoque por produto, com pesquisa, filtros, ordenação e paginação.
router.get('/produtos', async (request, response, next) => {
  try {
    const search = typeof request.query.q === 'string' ? request.query.q.trim() : '';
    const categoria = typeof request.query.categoria === 'string' ? request.query.categoria.trim() : '';
    const situacao = typeof request.query.situacao === 'string' ? request.query.situacao.trim().toUpperCase() : '';
    const active = parseActiveFilter(request.query.ativo);
    const pagination = parsePagination(request.query);
    const sortColumn = PRODUCT_SORT[request.query.ordenar || 'nome'];
    const direction = request.query.direcao === 'desc' ? 'DESC' : 'ASC';
    if (!pagination || Number.isNaN(active) || !sortColumn || (situacao && !['DISPONIVEL', 'BAIXO', 'SEM_ESTOQUE', 'REPOSICAO'].includes(situacao))) {
      return response.status(400).json({ error: 'Informe filtros, ordenação e paginação válidos.' });
    }

    const filters = [];
    const params = [];
    if (search) {
      filters.push('(nome LIKE ? OR codigo LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }
    if (categoria) {
      filters.push('categoria = ?');
      params.push(categoria);
    }
    if (situacao === 'REPOSICAO') {
      filters.push("situacao <> 'DISPONIVEL'");
    } else if (situacao) {
      filters.push('situacao = ?');
      params.push(situacao);
    }
    if (active !== null) {
      filters.push('ativo = ?');
      params.push(active);
    }
    const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const [countRows] = await getPool().execute(`SELECT COUNT(*) AS total FROM vw_saldo_estoque ${whereClause}`, params);
    const [rows] = await getPool().execute(
      `SELECT id_peca, codigo, nome, categoria, unidade, preco_custo, preco_atual, estoque_minimo, ativo, saldo_atual, situacao
       FROM vw_saldo_estoque
       ${whereClause}
       ORDER BY ${sortColumn} ${direction}, nome ASC
       LIMIT ? OFFSET ?`,
      [...params, pagination.limit, pagination.offset]
    );
    return response.json({ produtos: rows, pagination: paginationMetadata(pagination.page, pagination.limit, Number(countRows[0].total)) });
  } catch (error) {
    return next(error);
  }
});

// Indicadores das movimentações (todos os lançamentos registrados).
router.get('/movimentos/resumo', async (_request, response, next) => {
  try {
    const [[row]] = await getPool().execute(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(motivo = 'ENTRADA'), 0) AS entradas,
              COALESCE(SUM(CASE WHEN motivo = 'ENTRADA' THEN quantidade_delta ELSE 0 END), 0) AS entradas_unidades,
              COALESCE(SUM(motivo IN ('SAIDA', 'CONSUMO_OS')), 0) AS saidas,
              COALESCE(SUM(CASE WHEN motivo IN ('SAIDA', 'CONSUMO_OS') THEN -quantidade_delta ELSE 0 END), 0) AS saidas_unidades,
              COALESCE(SUM(motivo = 'AJUSTE'), 0) AS ajustes,
              COALESCE(SUM(motivo = 'ESTORNO'), 0) AS estornos
       FROM movimentos_estoque`
    );
    const [responsaveis] = await getPool().execute(
      `SELECT DISTINCT u.id_usuario, u.nome
       FROM movimentos_estoque AS m JOIN usuarios AS u ON u.id_usuario = m.registrado_por
       ORDER BY u.nome ASC`
    );
    return response.json({
      resumo: Object.fromEntries(Object.entries(row).map(([key, value]) => [key, Number(value)])),
      responsaveis
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/movimentos', async (request, response, next) => {
  try {
    const pagination = parsePagination(request.query);
    if (!pagination) {
      return response.status(400).json({ error: 'Informe uma paginação válida.' });
    }

    const filters = [];
    const params = [];
    const numericFilters = [['id_peca', 'm.id_peca'], ['responsavel', 'm.registrado_por'], ['id_os', 'op.id_os']];
    for (const [name, column] of numericFilters) {
      const raw = request.query[name];
      if (raw === undefined || String(raw).trim() === '') continue;
      const value = Number(raw);
      if (!Number.isInteger(value) || value <= 0) {
        return response.status(400).json({ error: name === 'id_peca' ? 'Informe uma peça válida.' : 'Informe filtros válidos.' });
      }
      filters.push(`${column} = ?`);
      params.push(value);
    }

    const search = typeof request.query.q === 'string' ? request.query.q.trim() : '';
    if (search) {
      filters.push('(p.nome LIKE ? OR p.codigo LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }

    const tipo = typeof request.query.tipo === 'string' ? request.query.tipo.trim().toUpperCase() : '';
    if (tipo) {
      const motivos = FILTRO_TIPO[tipo];
      if (!motivos) {
        return response.status(400).json({ error: 'Informe um tipo de movimentação válido.' });
      }
      filters.push(`m.motivo IN (${motivos.map(() => '?').join(', ')})`);
      params.push(...motivos);
    }

    const { de, ate } = request.query;
    if ((de !== undefined && de !== '' && !isDate(de)) || (ate !== undefined && ate !== '' && !isDate(ate))) {
      return response.status(400).json({ error: 'Informe o período no formato AAAA-MM-DD.' });
    }
    if (de) {
      filters.push('m.criado_em >= ?');
      params.push(`${de} 00:00:00`);
    }
    if (ate) {
      filters.push('m.criado_em < DATE_ADD(?, INTERVAL 1 DAY)');
      params.push(ate);
    }

    const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const [countRows] = await getPool().execute(
      `SELECT COUNT(*) AS total
       FROM movimentos_estoque AS m
       JOIN pecas AS p ON p.id_peca = m.id_peca
       LEFT JOIN os_pecas AS op ON op.id_os_peca = m.id_os_peca
       ${whereClause}`,
      params
    );
    const [rows] = await getPool().execute(
      `${MOVEMENT_SELECT}
       ${whereClause}
       ORDER BY m.criado_em DESC, m.id_movimento DESC
       LIMIT ? OFFSET ?`,
      [...params, pagination.limit, pagination.offset]
    );

    return response.json({ movimentos: rows, pagination: paginationMetadata(pagination.page, pagination.limit, Number(countRows[0].total)) });
  } catch (error) {
    return next(error);
  }
});

// Registra entrada, saída ou ajuste. O usuário informa o tipo e uma quantidade positiva;
// o sinal do movimento é sempre calculado aqui.
//   ENTRADA / SAIDA: `quantidade` (inteiro maior que zero).
//   AJUSTE: `saldo_contado` (saldo encontrado na contagem; a diferença vira o movimento).
router.post('/movimentos', async (request, response, next) => {
  let connection;
  try {
    const idPeca = Number(request.body?.id_peca);
    const tipo = typeof request.body?.tipo === 'string' ? request.body.tipo.trim().toUpperCase() : '';
    const observacao = typeof request.body?.observacao === 'string' ? request.body.observacao.trim() : '';
    const justificativa = typeof request.body?.justificativa === 'string' ? request.body.justificativa.trim() : '';

    if (!Number.isInteger(idPeca) || idPeca <= 0) {
      return response.status(400).json({ error: 'Informe uma peça válida.' });
    }
    if (['CONSUMO_OS', 'ESTORNO'].includes(tipo) || request.body?.id_os_peca !== undefined) {
      return response.status(400).json({ error: 'Consumos e estornos são registrados pelo fluxo da ordem de serviço.' });
    }
    if (!TIPOS_MANUAIS.includes(tipo)) {
      return response.status(400).json({ error: 'Informe o tipo da movimentação: ENTRADA, SAIDA ou AJUSTE.' });
    }
    if (observacao.length > 255 || justificativa.length > 60) {
      return response.status(400).json({ error: 'Observação (até 255) ou motivo (até 60 caracteres) acima do limite.' });
    }
    if (tipo !== 'ENTRADA' && !justificativa) {
      return response.status(400).json({ error: 'Informe o motivo da saída ou do ajuste.' });
    }

    const quantidade = Number(request.body?.quantidade);
    const saldoContado = Number(request.body?.saldo_contado);
    if (tipo === 'AJUSTE') {
      if (request.body?.saldo_contado === undefined || request.body?.saldo_contado === null || request.body?.saldo_contado === ''
        || !Number.isInteger(saldoContado) || saldoContado < 0) {
        return response.status(400).json({ error: 'Informe o saldo contado (número inteiro, zero ou maior).' });
      }
    } else if (!Number.isInteger(quantidade) || quantidade <= 0) {
      return response.status(400).json({ error: 'Informe uma quantidade inteira maior que zero.' });
    }

    connection = await getPool().getConnection();
    await connection.beginTransaction();

    const peca = await lockPartWithBalance(connection, idPeca);
    if (!peca) {
      await connection.rollback();
      return response.status(404).json({ error: 'Peça não encontrada.' });
    }
    if (!peca.ativo) {
      await connection.rollback();
      return response.status(409).json({ error: 'Peça inativa não pode ser movimentada. Reative o cadastro antes.' });
    }

    let delta;
    if (tipo === 'ENTRADA') {
      delta = quantidade;
    } else if (tipo === 'SAIDA') {
      if (quantidade > peca.saldo_atual) {
        await connection.rollback();
        return response.status(409).json({
          error: `Saída maior que o saldo disponível (${peca.saldo_atual}).`,
          saldo_disponivel: peca.saldo_atual
        });
      }
      delta = -quantidade;
    } else {
      delta = saldoContado - peca.saldo_atual;
      if (delta === 0) {
        await connection.rollback();
        return response.status(409).json({ error: 'O saldo contado é igual ao saldo atual; não há ajuste a registrar.', saldo_disponivel: peca.saldo_atual });
      }
    }

    const [result] = await connection.execute(
      `INSERT INTO movimentos_estoque (id_peca, id_os_peca, registrado_por, quantidade_delta, motivo, justificativa, observacao)
       VALUES (?, NULL, ?, ?, ?, ?, ?)`,
      [idPeca, request.user.id_usuario, delta, tipo, justificativa || null, observacao || null]
    );
    const [rows] = await connection.execute(`${MOVEMENT_SELECT} WHERE m.id_movimento = ? LIMIT 1`, [result.insertId]);

    await connection.commit();
    return response.status(201).json({ movimento: rows[0], saldo_anterior: peca.saldo_atual, saldo_atual: peca.saldo_atual + delta });
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
