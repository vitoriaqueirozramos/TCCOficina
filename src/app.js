const express = require('express');
const path = require('node:path');
const helmet = require('helmet');
const healthRoutes = require('./routes/health.routes');
const cookieParser = require('cookie-parser');
const authRoutes = require('./routes/auth.routes');
const clientesRoutes = require('./routes/clientes.routes');
const veiculosRoutes = require('./routes/veiculos.routes');
const usuariosRoutes = require('./routes/usuarios.routes');
const mecanicosRoutes = require('./routes/mecanicos.routes');
const servicosRoutes = require('./routes/servicos.routes');
const pecasRoutes = require('./routes/pecas.routes');
const estoqueRoutes = require('./routes/estoque.routes');
const dashboardRoutes = require('./routes/dashboard.routes');
const ordensServicoRoutes = require('./routes/ordens-servico.routes');

const app = express();

app.disable('x-powered-by');
app.use(helmet());
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/clientes', clientesRoutes);
app.use('/api/veiculos', veiculosRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/mecanicos', mecanicosRoutes);
app.use('/api/servicos', servicosRoutes);
app.use('/api/pecas', pecasRoutes);
app.use('/api/estoque', estoqueRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/ordens-servico', ordensServicoRoutes);
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use((_request, response) => {
  response.status(404).json({ error: 'Rota não encontrada.' });
});

app.use((error, _request, response, next) => {
  if (response.headersSent) {
    return next(error);
  }

  const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 500;
  if (statusCode >= 500) {
    console.error(error);
  }

  response.status(statusCode).json({
    error: statusCode >= 500 ? 'Erro interno do servidor.' : error.message
  });
});

module.exports = app;
