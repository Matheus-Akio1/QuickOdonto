const express = require('express');
const { z } = require('zod');
const { authMiddleware, permitirPerfis, escopoUnidade } = require('../../middleware/auth');
const { csrfMiddleware } = require('../../middleware/csrf');
const { auditar } = require('../../middleware/auditoria');
const { validar, uuidOu404 } = require('../../lib/http');
const service = require('./agenda.service');

const router = express.Router();

router.use(authMiddleware, csrfMiddleware, escopoUnidade('clinica'), auditar);

const LER = permitirPerfis(['secretaria', 'clinica', 'adm_clinica']);
const ESCREVER = permitirPerfis(['adm_clinica']);
const naoEncontrado = (req, res) => uuidOu404(req.params.id, res, 'Profissional não encontrado.');

const cor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Cor deve estar no formato #RRGGBB.');
const criarSchema = z
  .object({
    usuario_id: z.string().uuid(),
    cro: z.string().trim().min(3).max(20),
    especialidade: z.string().trim().max(60).nullish(),
    cor_agenda: cor.nullish(),
  })
  .strict();
const editarSchema = z
  .object({
    cro: z.string().trim().min(3).max(20),
    especialidade: z.string().trim().max(60).nullable(),
    cor_agenda: cor,
    ativo: z.boolean(),
  })
  .partial()
  .strict()
  .refine((d) => Object.keys(d).length > 0, 'Nada para alterar.');

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Horário deve estar no formato HH:MM.');
const horariosSchema = z
  .object({
    horarios: z
      .array(
        z
          .object({ dia_semana: z.number().int().min(0).max(6), inicio: hhmm, fim: hhmm })
          .refine((h) => h.fim > h.inicio, 'O fim deve ser depois do início.'),
      )
      .max(50),
  })
  .strict();

/**
 * @swagger
 * tags:
 *   name: Profissionais
 *   description: Dentistas da agenda e sua jornada
 * /profissionais:
 *   get:
 *     summary: Lista profissionais (Secretaria, Clínica e Adm. Clínica leem)
 *     tags: [Profissionais]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: query, name: todos, schema: { type: boolean }, description: 'true inclui inativos (só Adm. Clínica)' }
 *     responses:
 *       200: { description: Lista de profissionais }
 *       403: { description: Sem permissão }
 *   post:
 *     summary: Cadastra profissional a partir de um usuário com perfil Clínica
 *     tags: [Profissionais]
 *     security: [{ cookieAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [usuario_id, cro]
 *             properties:
 *               usuario_id: { type: string, format: uuid }
 *               cro: { type: string }
 *               especialidade: { type: string }
 *               cor_agenda: { type: string, example: '#2f7d6d' }
 *     responses:
 *       201: { description: Profissional criado }
 *       400: { description: Dados inválidos ou usuário sem perfil Clínica }
 *       403: { description: Somente Adm. Clínica }
 *       409: { description: Usuário já é profissional }
 */
router.get('/', LER, async (req, res, next) => {
  try {
    const todos = req.query.todos === 'true' && req.usuario.perfil === 'adm_clinica';
    return res.json(await service.listarProfissionais({ apenasAtivos: !todos }));
  } catch (err) {
    return next(err);
  }
});

router.post('/', ESCREVER, async (req, res, next) => {
  try {
    const dados = validar(criarSchema, req.body, res);
    if (!dados) return undefined;
    const criado = await service.criarProfissional(dados);
    res.locals.auditoria = {
      entidade: 'profissionais',
      entidadeId: criado.id,
      acao: 'criar',
      depois: criado,
    };
    return res.status(201).json(criado);
  } catch (err) {
    return next(err);
  }
});

/**
 * @swagger
 * /profissionais/{id}:
 *   patch:
 *     summary: Edita CRO, especialidade, cor ou ativa/inativa
 *     tags: [Profissionais]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Profissional atualizado }
 *       400: { description: Dados inválidos }
 *       404: { description: Não encontrado }
 * /profissionais/{id}/horarios:
 *   get:
 *     summary: Jornada semanal do profissional
 *     tags: [Profissionais]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Janelas por dia da semana (0 = domingo) }
 *       404: { description: Não encontrado }
 *   put:
 *     summary: Substitui a jornada semanal
 *     tags: [Profissionais]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               horarios:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     dia_semana: { type: integer, minimum: 0, maximum: 6 }
 *                     inicio: { type: string, example: '08:00' }
 *                     fim: { type: string, example: '12:00' }
 *     responses:
 *       200: { description: Jornada gravada }
 *       400: { description: Janelas inválidas ou sobrepostas }
 *       404: { description: Não encontrado }
 */
router.patch('/:id', ESCREVER, async (req, res, next) => {
  try {
    if (!naoEncontrado(req, res)) return undefined;
    const dados = validar(editarSchema, req.body, res);
    if (!dados) return undefined;
    const { antes, depois } = await service.atualizarProfissional(req.params.id, dados);
    res.locals.auditoria = {
      entidade: 'profissionais',
      entidadeId: depois.id,
      acao: 'editar',
      antes,
      depois,
    };
    return res.json(depois);
  } catch (err) {
    return next(err);
  }
});

router.get('/:id/horarios', LER, async (req, res, next) => {
  try {
    if (!naoEncontrado(req, res)) return undefined;
    return res.json({ horarios: await service.listarHorarios(req.params.id) });
  } catch (err) {
    return next(err);
  }
});

router.put('/:id/horarios', ESCREVER, async (req, res, next) => {
  try {
    if (!naoEncontrado(req, res)) return undefined;
    const dados = validar(horariosSchema, req.body, res);
    if (!dados) return undefined;
    const { antes, depois } = await service.substituirHorarios(req.params.id, dados.horarios);
    res.locals.auditoria = {
      entidade: 'profissional_horarios',
      entidadeId: req.params.id,
      acao: 'editar',
      antes: { horarios: antes },
      depois: { horarios: depois },
    };
    return res.json({ horarios: depois });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
