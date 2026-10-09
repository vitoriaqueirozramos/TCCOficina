require('dotenv').config();

const app = require('./app');
const { closePool } = require('./config/database');

const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be a valid TCP port.');
}

const server = app.listen(port, () => {
  console.info(`OFICINATECH API listening on port ${port}`);
});

function shutdown() {
  server.close(async () => {
    await closePool();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
