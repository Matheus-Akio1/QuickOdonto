const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const swaggerUi = require('swagger-ui-express');
const { z } = require('zod');

const swaggerSpec = require('./swagger');
const errorHandler = require('./middleware/errorHandler');
const healthRoutes = require('./modules/health/health.routes');
const authRoutes = require('./modules/auth/auth.routes');
const usuariosRoutes = require('./modules/usuarios/usuarios.routes');
const perfisRoutes = require('./modules/perfis/perfis.routes');
const auditoriaRoutes = require('./modules/auditoria/auditoria.routes');
const notificacoesRoutes = require('./modules/notificacoes/notificacoes.routes');
const pacientesRoutes = require('./modules/pacientes/pacientes.routes');
const profissionaisRoutes = require('./modules/agenda/profissionais.routes');
const consultasRoutes = require('./modules/agenda/consultas.routes');
const bloqueiosRoutes = require('./modules/agenda/bloqueios.routes');
const agendaRoutes = require('./modules/agenda/agenda.routes');
const prontuarioRoutes = require('./modules/prontuario/prontuario.routes');
const procedimentosRoutes = require('./modules/prontuario/procedimentos.routes');
const anexosRoutes = require('./modules/prontuario/anexos.routes');

// Mensagens de validação em português.
z.config(z.locales.ptBR());

const app = express();

app.set('trust proxy', 1);
app.use(helmet());
app.use(
  cors({
    origin: process.env.APP_URL,
    credentials: true,
  }),
);
app.use(express.json());
app.use(cookieParser());

app.use(healthRoutes);
app.get('/api-docs.json', (req, res) => res.json(swaggerSpec));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Rotas dos módulos de domínio, montadas em /api/v1/...
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/usuarios', usuariosRoutes);
app.use('/api/v1/perfis', perfisRoutes);
app.use('/api/v1/auditoria', auditoriaRoutes);
app.use('/api/v1/notificacoes', notificacoesRoutes);
app.use('/api/v1/pacientes', pacientesRoutes);
app.use('/api/v1/profissionais', profissionaisRoutes);
app.use('/api/v1/consultas', consultasRoutes);
app.use('/api/v1/bloqueios-agenda', bloqueiosRoutes);
app.use('/api/v1/agenda', agendaRoutes);
// Prontuário (M4): sub-rotas clínicas de /pacientes/:id/... ficam em routers próprios.
app.use(
  '/api/v1/pacientes',
  prontuarioRoutes.pacientes,
  procedimentosRoutes.pacientes,
  anexosRoutes.pacientes,
);
app.use('/api/v1/anamneses', prontuarioRoutes.anamneses);
app.use('/api/v1/evolucoes', prontuarioRoutes.evolucoes);
app.use('/api/v1/procedimentos', procedimentosRoutes.catalogo);
app.use('/api/v1/procedimentos-paciente', procedimentosRoutes.procedimentosPaciente);
app.use('/api/v1/planos-tratamento', procedimentosRoutes.planos);
app.use('/api/v1/anexos', anexosRoutes.anexos);
app.use('/api/v1/arquivos', anexosRoutes.arquivos);

app.use((req, res) => {
  res.status(404).json({ erro: 'Rota não encontrada.' });
});

app.use(errorHandler);

module.exports = app;
