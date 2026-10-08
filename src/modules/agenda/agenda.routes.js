const express = require('express');
const { z } = require('zod');
const { authMiddleware, permitirPerfis, escopoUnidade } = require('../../middleware/auth');
const { validar } = require('../../lib/http');
const service = require('./agenda.service');

const router = express.Router();

router.use(authMiddleware, escopoUnidade('clinica'), permitirPerfis(['secretaria', 'clinica']));

const schema = z.object({
  profissional: z.string().uuid(),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato AAAA-MM-DD.'),
  duracao: z.coerce.number().int().min(5).max(480).default(30),
});

/**
 * @swagger
 * /agenda/disponibilidade:
 *   get:
 *     summary: Horários livres do profissional num dia (jornada menos consultas ativas e bloqueios)
 *     tags: [Agenda]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: query, name: profissional, required: true, schema: { type: string, format: uuid } }
 *       - { in: query, name: data, required: true, schema: { type: string, format: date } }
 *       - { in: query, name: duracao, schema: { type: integer, default: 30, description: minutos } }
 *     responses:
 *       200: { description: Janelas livres (horário de Brasília, ISO 8601) }
 *       400: { description: Filtros inválidos }
 *       404: { description: Profissional não encontrado }
 */
router.get('/disponibilidade', async (req, res, next) => {
  try {
    const filtros = validar(schema, req.query, res);
    if (!filtros) return undefined;
    res.set('Cache-Control', 'no-store');
    return res.json(await service.disponibilidade(filtros));
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
