const { query } = require('../config/db');

const CHAVE_SENSIVEL = /senha|token|hash|secret|segredo/i;

/** Remove campos sensíveis (senha, token, hash) antes de gravar na trilha. */
function higienizar(obj) {
  if (obj === null || obj === undefined) return null;
  if (Array.isArray(obj)) return obj.map(higienizar);
  if (typeof obj === 'object' && !(obj instanceof Date)) {
    return Object.fromEntries(
      Object.entries(obj)
        .filter(([k]) => !CHAVE_SENSIVEL.test(k))
        .map(([k, v]) => [k, higienizar(v)]),
    );
  }
  return obj;
}

async function registrar({ usuario, entidade, entidadeId, acao, antes, depois, ip }) {
  await query(
    `INSERT INTO auditoria_logs (usuario_id, unidade, entidade, entidade_id, acao, antes, depois, ip)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      usuario ? usuario.id : null,
      usuario ? usuario.unidade : null,
      entidade,
      entidadeId ? String(entidadeId) : null,
      acao,
      JSON.stringify(higienizar(antes)),
      JSON.stringify(higienizar(depois)),
      ip || null,
    ],
  );
}

/**
 * Middleware de auditoria (RF-GER-009): o handler descreve a mudança em
 * res.locals.auditoria = { entidade, entidadeId, acao, antes, depois } e a trilha é
 * gravada quando a resposta de uma escrita bem-sucedida é enviada.
 */
function auditar(req, res, next) {
  // Idempotente: só um ouvinte por resposta, mesmo com vários routers no caminho.
  if (res.locals.auditoriaAtiva) return next();
  res.locals.auditoriaAtiva = true;
  res.on('finish', () => {
    const a = res.locals.auditoria;
    if (!a || res.statusCode >= 400) return;
    registrar({ usuario: req.usuario, ip: req.ip, ...a }).catch((err) =>
      console.error('[erro] falha ao gravar auditoria:', err.message),
    );
  });
  next();
}

module.exports = { auditar, registrar, higienizar };
