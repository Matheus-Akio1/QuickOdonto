const express = require('express');
const { z } = require('zod');
const { authMiddleware, permitirPerfis, escopoUnidade } = require('../../middleware/auth');
const { csrfMiddleware } = require('../../middleware/csrf');
const { auditar } = require('../../middleware/auditoria');
const { validar, uuidOu404, dataHora } = require('../../lib/http');
const service = require('./agenda.service');

const router = express.Router();

router.use(authMiddleware, csrfMiddleware, escopoUnidade('clinica'), auditar);
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

const LER = permitirPerfis(['secretaria', 'clinica']);
const ESCREVER = permitirPerfis(['secretaria']);
const idOk = (req, res) => uuidOu404(req.params.id, res, 'Consulta não encontrada.');

const STATUS = [
  'agendada',
  'confirmada',
  'chegou',
  'em_atendimento',
  'concluida',
  'faltou',
  'cancelada',
];
const MAX_MS = 8 * 3600000;
const MIN_MS = 5 * 60000;
const periodoOk = (d) => {
  const ms = new Date(d.fim) - new Date(d.inicio);
  return ms >= MIN_MS && ms <= MAX_MS;
};

const criarSchema = z
  .object({
    paciente_id: z.string().uuid(),
    profissional_id: z.string().uuid(),
    cadeira: z.number().int().min(1).max(20).default(1),
    inicio: dataHora,
    fim: dataHora,
    procedimento_previsto: z.string().trim().max(200).nullish(),
  })
  .strict()
  .refine(periodoOk, 'A consulta deve durar entre 5 minutos e 8 horas.');

const editarSchema = z
  .object({
    profissional_id: z.string().uuid(),
    cadeira: z.number().int().min(1).max(20),
    inicio: dataHora,
    fim: dataHora,
    procedimento_previsto: z.string().trim().max(200).nullable(),
  })
  .partial()
  .strict()
  .refine((d) => Object.keys(d).length > 0, 'Nada para alterar.')
  .refine(
    (d) => !(d.inicio && d.fim) || periodoOk(d),
    'A consulta deve durar entre 5 minutos e 8 horas.',
  );

const listaSchema = z
  .object({
    inicio: dataHora,
    fim: dataHora,
    profissional: z.string().uuid().optional(),
    status: z.enum(STATUS).optional(),
  })
  .refine((q) => new Date(q.fim) > new Date(q.inicio), 'O fim deve ser depois do início.')
  .refine(
    (q) => new Date(q.fim) - new Date(q.inicio) <= 62 * 86400000,
    'Período máximo de 62 dias.',
  );

const auditoriaConsulta = (acao, antes, depois) => ({
  entidade: 'consultas',
  entidadeId: depois.id,
  acao,
  antes,
  depois,
});

/**
 * @swagger
 * tags:
 *   name: Agenda
 *   description: Consultas, quadro por status e disponibilidade
 * /consultas:
 *   get:
 *     summary: Consultas de um período (dia, semana, mês ou quadro)
 *     tags: [Agenda]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: query, name: inicio, required: true, schema: { type: string, format: date-time } }
 *       - { in: query, name: fim, required: true, schema: { type: string, format: date-time } }
 *       - { in: query, name: profissional, schema: { type: string, format: uuid } }
 *       - { in: query, name: status, schema: { type: string } }
 *     responses:
 *       200: { description: Consultas do período (máx. 62 dias) }
 *       400: { description: Filtros inválidos }
 *       403: { description: Sem permissão }
 *   post:
 *     summary: Agenda consulta (RN-002 — sem conflito de profissional/cadeira; respeita jornada e bloqueios)
 *     tags: [Agenda]
 *     security: [{ cookieAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [paciente_id, profissional_id, inicio, fim]
 *             properties:
 *               paciente_id: { type: string, format: uuid }
 *               profissional_id: { type: string, format: uuid }
 *               cadeira: { type: integer, default: 1 }
 *               inicio: { type: string, format: date-time }
 *               fim: { type: string, format: date-time }
 *               procedimento_previsto: { type: string }
 *     responses:
 *       201: { description: Consulta criada }
 *       400: { description: Dados inválidos ou paciente inativo }
 *       403: { description: Somente Secretaria agenda }
 *       409: { description: Conflito de horário, fora da jornada ou bloqueado }
 */
router.get('/', LER, async (req, res, next) => {
  try {
    const filtros = validar(listaSchema, req.query, res);
    if (!filtros) return undefined;
    return res.json(await service.listarConsultas(filtros));
  } catch (err) {
    return next(err);
  }
});

router.post('/', ESCREVER, async (req, res, next) => {
  try {
    const dados = validar(criarSchema, req.body, res);
    if (!dados) return undefined;
    const criada = await service.criarConsulta(dados, req.usuario.id);
    res.locals.auditoria = auditoriaConsulta('criar', null, criada);
    return res.status(201).json(criada);
  } catch (err) {
    return next(err);
  }
});

/**
 * @swagger
 * /consultas/{id}:
 *   get:
 *     summary: Detalha a consulta com o histórico de status
 *     tags: [Agenda]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Consulta e histórico }
 *       404: { description: Não encontrada }
 *   patch:
 *     summary: Reagenda (profissional, cadeira, horário, procedimento) — só consultas agendada/confirmada
 *     tags: [Agenda]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Consulta atualizada }
 *       400: { description: Dados inválidos }
 *       404: { description: Não encontrada }
 *       409: { description: Conflito de horário ou status não permite }
 */
router.get('/:id', LER, async (req, res, next) => {
  try {
    if (!idOk(req, res)) return undefined;
    return res.json(await service.buscarConsulta(req.params.id, { comHistorico: true }));
  } catch (err) {
    return next(err);
  }
});

router.patch('/:id', ESCREVER, async (req, res, next) => {
  try {
    if (!idOk(req, res)) return undefined;
    const dados = validar(editarSchema, req.body, res);
    if (!dados) return undefined;
    const { antes, depois } = await service.reagendarConsulta(req.params.id, dados, req.usuario.id);
    res.locals.auditoria = auditoriaConsulta('reagendar', antes, depois);
    return res.json(depois);
  } catch (err) {
    return next(err);
  }
});

/**
 * @swagger
 * /consultas/{id}/status:
 *   patch:
 *     summary: Move no quadro (agendada → confirmada → chegou → em_atendimento → concluida; faltou) e grava histórico
 *     tags: [Agenda]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status: { type: string, enum: [confirmada, chegou, em_atendimento, concluida, faltou] }
 *     responses:
 *       200: { description: Consulta atualizada }
 *       400: { description: Status inválido (cancelamento usa /cancelar) }
 *       409: { description: Transição não permitida }
 * /consultas/{id}/cancelar:
 *   post:
 *     summary: Cancela com motivo e libera o horário (RN-010)
 *     tags: [Agenda]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [motivo]
 *             properties:
 *               motivo: { type: string }
 *     responses:
 *       200: { description: Consulta cancelada }
 *       400: { description: Motivo ausente }
 *       409: { description: Status não permite cancelar }
 * /consultas/{id}/lembrete-whatsapp:
 *   get:
 *     summary: Link wa.me com a mensagem de lembrete pronta (registrado na auditoria)
 *     tags: [Agenda]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: "{ url, celular (mascarado) }" }
 *       400: { description: Paciente sem celular }
 *       409: { description: Consulta não está a realizar }
 */
router.patch('/:id/status', ESCREVER, async (req, res, next) => {
  try {
    if (!idOk(req, res)) return undefined;
    const dados = validar(
      z
        .object({
          status: z.enum(['confirmada', 'chegou', 'em_atendimento', 'concluida', 'faltou']),
        })
        .strict(),
      req.body,
      res,
    );
    if (!dados) return undefined;
    const { antes, depois } = await service.mudarStatus(
      req.params.id,
      dados.status,
      req.usuario.id,
    );
    res.locals.auditoria = auditoriaConsulta('status', antes, depois);
    return res.json(depois);
  } catch (err) {
    return next(err);
  }
});

router.post('/:id/cancelar', ESCREVER, async (req, res, next) => {
  try {
    if (!idOk(req, res)) return undefined;
    const dados = validar(
      z.object({ motivo: z.string().trim().min(3).max(300) }).strict(),
      req.body,
      res,
    );
    if (!dados) return undefined;
    const { antes, depois } = await service.cancelarConsulta(
      req.params.id,
      dados.motivo,
      req.usuario.id,
    );
    res.locals.auditoria = auditoriaConsulta('cancelar', antes, depois);
    return res.json(depois);
  } catch (err) {
    return next(err);
  }
});

router.get('/:id/lembrete-whatsapp', ESCREVER, async (req, res, next) => {
  try {
    if (!idOk(req, res)) return undefined;
    const lembrete = await service.lembreteWhatsapp(req.params.id);
    res.locals.auditoria = {
      entidade: 'consultas',
      entidadeId: req.params.id,
      acao: 'lembrete_whatsapp',
    };
    return res.json(lembrete);
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
