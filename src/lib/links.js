const crypto = require('crypto');
const { query } = require('../config/db');

/** Links de download de uso único e curta duração (seção 3.1/3.2). Só o hash vai ao banco. */
const VALIDADE_SEGUNDOS = 60;
const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');

async function emitir({ tipo, referenciaId, usuarioId }) {
  const token = crypto.randomBytes(32).toString('base64url');
  const { rows } = await query(
    `INSERT INTO links_download (token_hash, tipo, referencia_id, usuario_id, expira_em)
     VALUES ($1,$2,$3,$4, now() + ($5 || ' seconds')::interval) RETURNING expira_em`,
    [sha256(token), tipo, referenciaId, usuarioId, String(VALIDADE_SEGUNDOS)],
  );
  return { url: `/api/v1/arquivos/${token}`, expira_em: rows[0].expira_em };
}

/** Consome o token (uso único, atômico). Devolve o link ou null se inválido, expirado ou já usado. */
async function consumir(token) {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token || '')) return null;
  const { rows } = await query(
    `UPDATE links_download SET usado_em = now(), atualizado_em = now()
      WHERE token_hash = $1 AND usado_em IS NULL AND expira_em > now()
      RETURNING tipo, referencia_id, usuario_id`,
    [sha256(token)],
  );
  return rows[0] ?? null;
}

module.exports = { emitir, consumir, VALIDADE_SEGUNDOS };
