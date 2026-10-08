const express = require('express');
const { z } = require('zod');
const { authMiddleware, permitirPerfis, escopoUnidade } = require('../../middleware/auth');
const { csrfMiddleware } = require('../../middleware/csrf');
const { auditar } = require('../../middleware/auditoria');
const { validar, uuidOu404, dataHora } = require('../../lib/http');
const service = require('./agenda.service');

const router = express.Router();

router.use(
  authMiddleware,
  csrfMiddleware,
  escopoUnidade('clinica'),
  permitirPerfis(['secretaria', 'adm_clinica']),
  auditar,
);

const listaSchema = z
  .object({ inicio: dataHora, fim: dataHora, profissional: z.string().uuid().optional() })
  .refine((q) => new Date(q.fim) > new Date(q.inicio), 'O fim deve ser depois do início.');

const criarSchema = z
  .object({
    profissional_id: z.string().uuid().nullish(),
    inicio: dataHora,
    fim: dataHora,
    motivo: z.string().trim().min(3).max(200),
  })
  .strict()
  .refine((b) => new Date(b.fim) > new Date(b.inicio), 'O fim deve ser depois do início.');

/**
 * @swagger
 * tags:
 *   name: Bloqueios
 *   description: Feriados, intervalos e bloqueios da agenda
 * /bloqueios-agenda:
 *   get:
 *     summary: Bloqueios de um período (inclui os da clínica toda)
 *     tags: [Bloqueios]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: query, name: inicio, required: true, schema: { type: string, format: date-time } }
 *       - { in: query, name: fim, required: true, schema: { type: string, format: date-time } }
 *       - { in: query, name: profissional, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Bloqueios }
 *       400: { description: Filtros inválidos }
 *       403: { description: Sem permissão }
 *   post:
 *     summary: Cria bloqueio (profissional_id nulo = clínica toda); recusa se houver consultas no período
 *     tags: [Bloqueios]
 *     security: [{ cookieAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [inicio, fim, motivo]
 *             properties:
 *               profissional_id: { type: string, format: uuid, nullable: true }
 *               inicio: { type: string, format: date-time }
 *               fim: { type: string, format: date-time }
 *               motivo: { type: string }
 *     responses:
 *       201: { description: Bloqueio criado }
 *       400: { description: Dados inválidos }
 *       409: { description: Há consultas no período }
 * /bloqueios-agenda/{id}:
 *   delete:
 *     summary: Remove o bloqueio
 *     tags: [Bloqueios]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       204: { description: Removido }
 *       404: { description: Não encontrado }
 */
router.get('/', async (req, res, next) => {
  try {
    const filtros = validar(listaSchema, req.query, res);
    if (!filtros) return undefined;
    return res.json(await service.listarBloqueios(filtros));
  } catch (err) {
    return next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const dados = validar(criarSchema, req.body, res);
    if (!dados) return undefined;
    const criado = await service.criarBloqueio(dados, req.usuario.id);
    res.locals.auditoria = {
      entidade: 'bloqueios_agenda',
      entidadeId: criado.id,
      acao: 'criar',
      depois: criado,
    };
    return res.status(201).json(criado);
  } catch (err) {
    return next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    if (!uuidOu404(req.params.id, res, 'Bloqueio não encontrado.')) return undefined;
    const removido = await service.removerBloqueio(req.params.id);
    res.locals.auditoria = {
      entidade: 'bloqueios_agenda',
      entidadeId: removido.id,
      acao: 'excluir',
      antes: removido,
    };
    return res.status(204).end();
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
