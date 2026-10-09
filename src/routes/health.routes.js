const express = require('express');
const { getPool } = require('../config/database');

const router = express.Router();

router.get('/', (_request, response) => {
  response.json({ status: 'ok' });
});

router.get('/database', async (_request, response) => {
  try {
    await getPool().query('SELECT 1');
    response.json({ status: 'ok', database: 'connected' });
  } catch {
    response.status(503).json({ status: 'unavailable', database: 'disconnected' });
  }
});

module.exports = router;
