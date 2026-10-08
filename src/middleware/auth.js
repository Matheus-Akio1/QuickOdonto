const jwt = require('jsonwebtoken');
const { query } = require('../config/db');
const { ACCESS_COOKIE, jwtSecret } = require('../config/auth');

function extrairToken(req) {
  if (req.cookies && req.cookies[ACCESS_COOKIE]) return req.cookies[ACCESS_COOKIE];
  // Modo app nativo (fase 2): token de sessão no header Authorization.
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

/**
 * Valida o JWT e injeta req.usuario. Consulta o banco a cada requisição para que
 * bloqueio de usuário valha imediatamente (não espera o token expirar).
 */
async function authMiddleware(req, res, next) {
  // Idempotente: vários routers no mesmo prefixo não repetem a consulta.
  if (req.usuario) return next();
  try {
    const token = extrairToken(req);
    if (!token) return res.status(401).json({ erro: 'Não autenticado.' });

    let payload;
    try {
      payload = jwt.verify(token, jwtSecret(), { algorithms: ['HS256'] });
    } catch {
      return res.status(401).json({ erro: 'Sessão inválida ou expirada.' });
    }

    const { rows } = await query(
      'SELECT id, nome, email, perfil, unidade, status FROM usuarios WHERE id = $1',
      [payload.sub],
    );
    const usuario = rows[0];
    if (!usuario || usuario.status !== 'ativo') {
      return res.status(401).json({ erro: 'Sessão inválida ou expirada.' });
    }

    req.usuario = usuario;
    return next();
  } catch (err) {
    return next(err);
  }
}

/** Autorização por perfil. Lista vazia nega todos (negar por padrão). */
function permitirPerfis(perfis = []) {
  return (req, res, next) => {
    if (!req.usuario) return res.status(401).json({ erro: 'Não autenticado.' });
    if (!perfis.includes(req.usuario.perfil)) {
      return res.status(403).json({ erro: 'Sem permissão para esta operação.' });
    }
    return next();
  };
}

/** RN-008 — só passa quem é da unidade exigida pela rota. */
function escopoUnidade(unidade) {
  return (req, res, next) => {
    if (!req.usuario) return res.status(401).json({ erro: 'Não autenticado.' });
    if (req.usuario.unidade !== unidade) {
      return res.status(403).json({ erro: 'Sem permissão para esta operação.' });
    }
    return next();
  };
}

module.exports = { authMiddleware, permitirPerfis, escopoUnidade };
