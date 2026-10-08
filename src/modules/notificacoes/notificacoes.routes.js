const express = require('express');
const { z } = require('zod');
const { query } = require('../../config/db');
const { authMiddleware } = require('../../middleware/auth');
const { csrfMiddleware } = require('../../middleware/csrf');

const router = express.Router();

router.use(authMiddleware, csrfMiddleware);

/** Cria notificação interna para um usuário (uso dos demais módulos). */
async function notificar(usuarioId, { tipo, titulo, link }) {
  await query('INSERT INTO notificacoes (usuario_id, tipo, titulo, link) VALUES ($1,$2,$3,$4)', [
    usuarioId,
    tipo,
    titulo,
    link || null,
  ]);
}

/**
 * @swagger
 * /notificacoes:
 *   get:
 *     summary: Notificações do usuário logado (mais recentes primeiro)
 *     tags: [Notificações]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: query, name: nao_lidas, schema: { type: boolean } }
 *       - { in: query, name: pagina, schema: { type: integer, default: 1 } }
 *       - { in: query, name: limite, schema: { type: integer, default: 20, maximum: 100 } }
 *     responses:
 *       200: { description: Página de notificações e total de não lidas }
 *       401: { description: Não autenticado }
 */
router.get('/', async (req, res, next) => {
  try {
    const r = z
      .object({
        nao_lidas: z.enum(['true', 'false']).optional(),
        pagina: z.coerce.number().int().min(1).default(1),
        limite: z.coerce.number().int().min(1).max(100).default(20),
      })
      .safeParse(req.query);
    if (!r.success) return res.status(400).json({ erro: 'Filtro inválido.' });
    const { nao_lidas, pagina, limite } = r.data;

    const extra = nao_lidas === 'true' ? ' AND lida_em IS NULL' : '';
    const { rows } = await query(
      `SELECT id, tipo, titulo, link, lida_em, criado_em FROM notificacoes
        WHERE usuario_id = $1${extra} ORDER BY criado_em DESC LIMIT $2 OFFSET $3`,
      [req.usuario.id, limite, (pagina - 1) * limite],
    );
    const nl = await query(
      'SELECT count(*)::int AS n FROM notificacoes WHERE usuario_id = $1 AND lida_em IS NULL',
      [req.usuario.id],
    );
    res.set('Cache-Control', 'no-store');
    return res.json({ itens: rows, pagina, limite, nao_lidas: nl.rows[0].n });
  } catch (err) {
    return next(err);
  }
});

/**
 * @swagger
 * /notificacoes/{id}/lida:
 *   patch:
 *     summary: Marca a notificação como lida
 *     tags: [Notificações]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       204: { description: Marcada como lida }
 *       404: { description: Não encontrada (ou de outro usuário) }
 */
router.patch('/:id/lida', async (req, res, next) => {
  try {
    if (!z.string().uuid().safeParse(req.params.id).success) {
      return res.status(404).json({ erro: 'Notificação não encontrada.' });
    }
    const { rowCount } = await query(
      `UPDATE notificacoes SET lida_em = COALESCE(lida_em, now()), atualizado_em = now()
        WHERE id = $1 AND usuario_id = $2`,
      [req.params.id, req.usuario.id],
    );
    if (!rowCount) return res.status(404).json({ erro: 'Notificação não encontrada.' });
    return res.status(204).end();
  } catch (err) {
    return next(err);
  }
});

router.notificar = notificar;
module.exports = router;
