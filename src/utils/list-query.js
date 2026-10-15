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
  if (value === undefined || value === '') return null;
  if (value === 'true') return 1;
  if (value === 'false') return 0;
  return Number.NaN;
}

module.exports = { paginationMetadata, parseActiveFilter, parsePagination };