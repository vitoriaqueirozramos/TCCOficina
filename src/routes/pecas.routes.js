const express = require('express');
const { getPool } = require('../config/database');
const { authenticate, requireRoles } = require('../middleware/auth.middleware');
const { paginationMetadata, parseActiveFilter, parseBoolean, parsePagination } = require('../utils/list-query');

const router = express.Router();
const PART_SELECT = `SELECT p.id_peca, p.codigo, p.nome, p.descricao, p.categoria, p.unidade,
                            p.preco_custo, p.preco_atual, p.estoque_minimo, p.ativo,
                            s.saldo_atual, s.situacao
                     FROM pecas AS p
                     JOIN vw_saldo_estoque AS s ON s.id_peca = p.id_peca`;
const UNIDADES = ['UN', 'PAR', 'JG', 'KIT', 'CX', 'L', 'M'];

router.use(authenticate, requireRoles('ADMINISTRADOR', 'ATENDENTE'));

async function findPart(idPeca) {
  const [rows] = await getPool().execute(`${PART_SELECT} WHERE p.id_peca = ? LIMIT 1`, [idPeca]);
  return rows[0] || null;
}

router.get('/', async (request, response, next) => {
  try {
    const search = typeof request.query.q === 'string' ? request.query.q.trim() : '';
    const categoria = typeof request.query.categoria === 'string' ? request.query.categoria.trim() : '';
    const active = parseActiveFilter(request.query.ativo);
    const pagination = parsePagination(request.query);
    if (!pagination || Number.isNaN(active)) {
      return response.status(400).json({ error: 'Informe filtros de paginação ou situação válidos.' });
    }
    const filters = [];
    const params = [];
    if (search) {
      filters.push('(p.codigo LIKE ? OR p.nome LIKE ? OR p.descricao LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (categoria) {
      filters.push('p.categoria = ?');
      params.push(categoria);
    }
    if (active !== null) {
      filters.push('p.ativo = ?');
      params.push(active);
    }
    const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const [countRows] = await getPool().execute(`SELECT COUNT(*) AS total FROM pecas AS p ${whereClause}`, params);
    const [rows] = await getPool().execute(
      `${PART_SELECT}
       ${whereClause}
       ORDER BY p.nome ASC
       LIMIT ${Number.parseInt(pagination.limit, 10)} OFFSET ${Number.parseInt(pagination.offset, 10)}`,
      params
    );

    return response.json({ pecas: rows, pagination: paginationMetadata(pagination.page, pagination.limit, Number(countRows[0].total)) });
  } catch (error) {
    return next(error);
  }
});

// Peças ativas com saldo para os seletores (sem a paginação da tela de cadastro).
router.get('/opcoes', async (_request, response, next) => {
  try {
    const [rows] = await getPool().execute(
      `SELECT id_peca, codigo, nome, unidade, preco_atual, saldo_atual
       FROM vw_saldo_estoque
       WHERE ativo = TRUE
       ORDER BY nome ASC`
    );
    response.json({ pecas: rows });
  } catch (error) {
    next(error);
  }
});

router.get('/categorias', async (_request, response, next) => {
  try {
    const [rows] = await getPool().execute('SELECT DISTINCT categoria FROM pecas ORDER BY categoria ASC');
    response.json({ categorias: rows.map((row) => row.categoria), unidades: UNIDADES });
  } catch (error) {
    next(error);
  }
});

router.get('/:id_peca', async (request, response, next) => {
  try {
    const idPeca = Number(request.params.id_peca);
    if (!Number.isInteger(idPeca) || idPeca <= 0) {
      return response.status(400).json({ error: 'Informe uma peça válida.' });
    }
    const peca = await findPart(idPeca);
    if (!peca) {
      return response.status(404).json({ error: 'Peça não encontrada.' });
    }
    return response.json({ peca });
  } catch (error) {
    return next(error);
  }
});

function readPartBody(body) {
  const codigo = typeof body?.codigo === 'string' ? body.codigo.trim() : '';
  const nome = typeof body?.nome === 'string' ? body.nome.trim() : '';
  const descricao = typeof body?.descricao === 'string' ? body.descricao.trim() : '';
  const categoria = typeof body?.categoria === 'string' && body.categoria.trim() ? body.categoria.trim() : 'Geral';
  const unidade = typeof body?.unidade === 'string' && body.unidade.trim() ? body.unidade.trim().toUpperCase() : 'UN';
  const precoAtual = Number(body?.preco_atual);
  const precoCusto = body?.preco_custo === undefined || body?.preco_custo === null || body?.preco_custo === '' ? 0 : Number(body.preco_custo);
  const estoqueMinimo = body?.estoque_minimo === undefined || body?.estoque_minimo === null || body?.estoque_minimo === '' ? 0 : Number(body.estoque_minimo);

  if (!codigo || codigo.length > 40) {
    return { error: 'Informe o código da peça (até 40 caracteres).' };
  }
  if (!nome || nome.length > 120) {
    return { error: 'Informe o nome da peça (até 120 caracteres).' };
  }
  if (categoria.length > 40) {
    return { error: 'A categoria deve ter até 40 caracteres.' };
  }
  if (!UNIDADES.includes(unidade)) {
    return { error: `Informe uma unidade de medida válida (${UNIDADES.join(', ')}).` };
  }
  if (body?.preco_atual === '' || body?.preco_atual === null || !Number.isFinite(precoAtual) || precoAtual < 0) {
    return { error: 'Informe um preço de venda válido para a peça.' };
  }
  if (!Number.isFinite(precoCusto) || precoCusto < 0) {
    return { error: 'Informe um preço de custo válido para a peça.' };
  }
  if (!Number.isInteger(estoqueMinimo) || estoqueMinimo < 0) {
    return { error: 'Informe um estoque mínimo válido (número inteiro, zero ou maior).' };
  }

  return {
    values: {
      codigo,
      nome,
      descricao: descricao || null,
      categoria,
      unidade,
      precoCusto: Number(precoCusto.toFixed(2)),
      precoAtual: Number(precoAtual.toFixed(2)),
      estoqueMinimo
    }
  };
}

router.put('/:id_peca', async (request, response, next) => {
  const idPeca = Number(request.params.id_peca);
  if (!Number.isInteger(idPeca) || idPeca <= 0) {
    return response.status(400).json({ error: 'Informe uma peça válida.' });
  }
  const { error, values } = readPartBody(request.body);
  if (error) {
    return response.status(400).json({ error });
  }
  try {
    await getPool().execute(
      `UPDATE pecas
       SET codigo = ?, nome = ?, descricao = ?, categoria = ?, unidade = ?, preco_custo = ?, preco_atual = ?, estoque_minimo = ?
       WHERE id_peca = ?`,
      [values.codigo, values.nome, values.descricao, values.categoria, values.unidade, values.precoCusto, values.precoAtual, values.estoqueMinimo, idPeca]
    );
    const peca = await findPart(idPeca);
    if (!peca) {
      return response.status(404).json({ error: 'Peça não encontrada.' });
    }
    return response.json({ peca });
  } catch (caught) {
    if (caught.code === 'ER_DUP_ENTRY') {
      return response.status(409).json({ error: 'Já existe uma peça com este código.' });
    }
    return next(caught);
  }
});

router.patch('/:id_peca/ativo', async (request, response, next) => {
  const idPeca = Number(request.params.id_peca);
  const ativo = parseBoolean(request.body?.ativo);
  if (!Number.isInteger(idPeca) || idPeca <= 0 || ativo === null) {
    return response.status(400).json({ error: 'Informe uma peça e uma situação válida (ativo: true ou false).' });
  }
  try {
    await getPool().execute('UPDATE pecas SET ativo = ? WHERE id_peca = ?', [ativo, idPeca]);
    const peca = await findPart(idPeca);
    if (!peca) {
      return response.status(404).json({ error: 'Peça não encontrada.' });
    }
    return response.json({ peca, message: ativo ? 'Peça ativada.' : 'Peça inativada.' });
  } catch (error) {
    return next(error);
  }
});

router.post('/', async (request, response, next) => {
  const ativo = request.body?.ativo === undefined ? true : parseBoolean(request.body.ativo);
  const { error, values } = readPartBody(request.body);
  if (error) {
    return response.status(400).json({ error });
  }
  if (ativo === null) {
    return response.status(400).json({ error: 'Informe uma situação válida (ativo: true ou false).' });
  }

  try {
    const [result] = await getPool().execute(
      `INSERT INTO pecas (codigo, nome, descricao, categoria, unidade, preco_custo, preco_atual, estoque_minimo, ativo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [values.codigo, values.nome, values.descricao, values.categoria, values.unidade, values.precoCusto, values.precoAtual, values.estoqueMinimo, ativo]
    );
    return response.status(201).json({ peca: await findPart(result.insertId) });
  } catch (caught) {
    if (caught.code === 'ER_DUP_ENTRY') {
      return response.status(409).json({ error: 'Já existe uma peça com este código.' });
    }
    return next(caught);
  }
});

module.exports = router;
