require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');

const swaggerSpec = require('./swagger');
const errorHandler = require('./middleware/errorHandler');
const healthRoutes = require('./modules/health/health.routes');

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: process.env.APP_URL,
    credentials: true,
  }),
);
app.use(express.json());

app.use(healthRoutes);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Rotas dos módulos de domínio entram aqui, montadas em /api/v1/...

app.use((req, res) => {
  res.status(404).json({ erro: 'Rota não encontrada.' });
});

app.use(errorHandler);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`QuickOdonto API rodando na porta ${PORT}`);
  console.log(`Swagger UI em http://localhost:${PORT}/api-docs`);
});

module.exports = app;
