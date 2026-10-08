const express = require('express');
const { z } = require('zod');
const { query } = require('../../config/db');
const { authMiddleware, permitirPerfis } = require('../../middleware/auth');

const router = express.Router();

router.use(authMiddleware, permitirPerfis(['adm_clinica', 'adm_laboratorio']));

const filtroSchema = z.object({
  entidade: z.string().trim().max(60).optional(),
  entidade_id: z.string().trim().max(60).optional(),
  usuario: z.string().uuid().optional(),
  inicio: z.coerce.date().optional(),
  fim: z.coerce.date().optional(),
  pagina: z.coerce.number().int().min(1).default(1),
  limite: z.coerce.number().int().min(1).max(100).default(20),
});

/**
 * @swagger
 * /auditoria:
 *   get:
 *     summary: Trilha de auditoria da unidade (filtrável por entidade, usuário e período)
 *     tags: [Auditoria]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: query, name: entidade, schema: { type: string } }
 *       - { in: query, name: entidade_id, schema: { type: string } }
 *       - { in: query, name: usuario, schema: { type: string, format: uuid } }
 *       - { in: query, name: inicio, schema: { type: string, format: date-time } }
 *       - { in: query, name: fim, schema: { type: string, format: date-time } }
 *       - { in: query, name: pagina, schema: { type: integer, default: 1 } }
 *       - { in: query, name: limite, schema: { type: integer, default: 20, maximum: 100 } }
 *     responses:
 *       200: { description: Página de registros (somente da unidade do solicitante) }
 *       400: { description: Filtro inválido }
 *       403: { description: Perfil sem permissão }
 */
router.get('/', async (req, res, next) => {
  try {
    const r = filtroSchema.safeParse(req.query);
    if (!r.success)
      return res.status(400).json({ erro: r.error.issues[0]?.message || 'Filtro inválido.' });
    const f = r.data;

    const cond = ['a.unidade = $1'];
    const val = [req.usuario.unidade];
    const add = (sql, v) => {
      val.push(v);
      cond.push(sql.replace('?', `$${val.length}`));
    };
    if (f.entidade) add('a.entidade = ?', f.entidade);
    if (f.entidade_id) add('a.entidade_id = ?', f.entidade_id);
    if (f.usuario) add('a.usuario_id = ?', f.usuario);
    if (f.inicio) add('a.em >= ?', f.inicio);
    if (f.fim) add('a.em <= ?', f.fim);
    const where = cond.join(' AND ');

    const total = await query(
      `SELECT count(*)::int AS n FROM auditoria_logs a WHERE ${where}`,
      val,
    );
    const { rows } = await query(
      `SELECT a.id, a.em, a.entidade, a.entidade_id, a.acao, a.antes, a.depois, a.ip,
              u.nome AS usuario_nome
         FROM auditoria_logs a LEFT JOIN usuarios u ON u.id = a.usuario_id
        WHERE ${where} ORDER BY a.em DESC LIMIT $${val.length + 1} OFFSET $${val.length + 2}`,
      [...val, f.limite, (f.pagina - 1) * f.limite],
    );
    res.set('Cache-Control', 'no-store');
    return res.json({ itens: rows, pagina: f.pagina, limite: f.limite, total: total.rows[0].n });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
