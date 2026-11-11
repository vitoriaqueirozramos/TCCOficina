const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

function parsePagination(query) {
  const page = query.page === undefined ? 1 : Number(query.page);
  const limit = query.limit === undefined ? DEFAULT_PAGE_SIZE : Number(query.limit);
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
    return null;
  }

  return { page, limit, offset: (page - 1) * limit };
}

function paginationMetadata(page, limit, total) {
  return { page, limit, total, pages: Math.ceil(total / limit) };
}

function parseActiveFilter(value) {
  if (value === undefined || value === 'true') return 1;
  if (value === '' || value === 'all') return null;
  if (value === 'false') return 0;
  return Number.NaN;
}

// Aceita os formatos que chegam do navegador e do MySQL (true/false, 1/0 e seus textos).
// Devolve null quando o valor não representa um booleano.
function parseBoolean(value) {
  if (value === true || value === 1 || value === '1' || value === 'true') return true;
  if (value === false || value === 0 || value === '0' || value === 'false') return false;
  return null;
}

function parsePositiveId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

module.exports = { paginationMetadata, parseActiveFilter, parseBoolean, parsePagination, parsePositiveId };
