const rateLimit = require('express-rate-limit');

/** Limitador compartilhado das rotas públicas de /auth/* (RNF-002). */
const limitadorAuth = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.AUTH_RATE_LIMIT) || 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { erro: 'Muitas requisições. Tente novamente em instantes.' },
});

module.exports = { limitadorAuth };
