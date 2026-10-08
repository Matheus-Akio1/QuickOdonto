const crypto = require('crypto');
const { ACCESS_COOKIE, jwtSecret } = require('../config/auth');

const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Token CSRF atrelado ao access token da sessão (HMAC) — sem estado no servidor. */
function gerarCsrf(accessToken) {
  return crypto.createHmac('sha256', jwtSecret()).update(`csrf:${accessToken}`).digest('base64url');
}

/**
 * Proteção CSRF para rotas de escrita autenticadas por cookie: exige o header
 * X-CSRF-Token igual ao HMAC do access token. Requisições com Authorization: Bearer
 * (app nativo) não carregam credencial ambiente e ficam isentas.
 */
function csrfMiddleware(req, res, next) {
  if (METODOS_SEGUROS.has(req.method)) return next();
  const access = req.cookies && req.cookies[ACCESS_COOKIE];
  if (!access) return next();

  const enviado = Buffer.from(req.get('x-csrf-token') || '');
  const esperado = Buffer.from(gerarCsrf(access));
  if (enviado.length !== esperado.length || !crypto.timingSafeEqual(enviado, esperado)) {
    return res.status(403).json({ erro: 'Token CSRF ausente ou inválido.' });
  }
  return next();
}

module.exports = { gerarCsrf, csrfMiddleware };
