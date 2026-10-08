const express = require('express');
const { z } = require('zod');
const { authMiddleware, permitirPerfis } = require('../../middleware/auth');
const { csrfMiddleware } = require('../../middleware/csrf');
const { auditar } = require('../../middleware/auditoria');
const service = require('./usuarios.service');

const router = express.Router();

router.use(
  authMiddleware,
  csrfMiddleware,
  permitirPerfis(['adm_clinica', 'adm_laboratorio']),
  auditar,
);

const PERFIS = ['secretaria', 'clinica', 'adm_clinica', 'laboratorio', 'adm_laboratorio'];
const idSchema = z.string().uuid();

const criarSchema = z.object({
  nome: z.string().trim().min(2).max(120),
  email: z.string().email().max(254),
  perfil: z.enum(PERFIS),
});
const editarSchema = criarSchema
  .partial()
  .refine((d) => Object.keys(d).length > 0, 'Nada para alterar.');
const listaSchema = z.object({
  busca: z.string().trim().max(100).optional(),
  status: z.enum(['ativo', 'bloqueado', 'convidado']).optional(),
  pagina: z.coerce.number().int().min(1).default(1),
  limite: z.coerce.number().int().min(1).max(100).default(20),
});

function validar(schema, dados, res) {
  const r = schema.safeParse(dados);
  if (!r.success) {
    res.status(400).json({ erro: r.error.issues[0]?.message || 'Dados inválidos.' });
    return null;
  }
  return r.data;
}

const idValido = (req, res) =>
  idSchema.safeParse(req.params.id).success
    ? true
    : !res.status(404).json({ erro: 'Usuário não encontrado.' });

/**
 * @swagger
 * tags:
 *   name: Usuários
 *   description: Gestão de usuários da própria unidade (AC, AL)
 * /usuarios:
 *   get:
 *     summary: Lista usuários da unidade do administrador
 *     tags: [Usuários]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: query, name: busca, schema: { type: string } }
 *       - { in: query, name: status, schema: { type: string, enum: [ativo, bloqueado, convidado] } }
 *       - { in: query, name: pagina, schema: { type: integer, default: 1 } }
 *       - { in: query, name: limite, schema: { type: integer, default: 20, maximum: 100 } }
 *     responses:
 *       200: { description: Página de usuários }
 *       401: { description: Não autenticado }
 *       403: { description: Perfil sem permissão }
 *   post:
 *     summary: Cria usuário (status convidado) e envia o convite por e-mail
 *     tags: [Usuários]
 *     security: [{ cookieAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nome, email, perfil]
 *             properties:
 *               nome: { type: string }
 *               email: { type: string, format: email }
 *               perfil: { type: string, enum: [secretaria, clinica, adm_clinica, laboratorio, adm_laboratorio] }
 *     responses:
 *       201: { description: Usuário criado }
 *       400: { description: Dados ou perfil inválidos para a unidade }
 *       403: { description: Sem permissão ou CSRF inválido }
 *       409: { description: E-mail já cadastrado }
 */
router.get('/', async (req, res, next) => {
  try {
    const filtros = validar(listaSchema, req.query, res);
    if (!filtros) return undefined;
    res.set('Cache-Control', 'no-store');
    return res.json(await service.listar(req.usuario.unidade, filtros));
  } catch (err) {
    return next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const dados = validar(criarSchema, req.body, res);
    if (!dados) return undefined;
    const usuario = await service.criar(req.usuario.unidade, dados);
    res.locals.auditoria = {
      entidade: 'usuarios',
      entidadeId: usuario.id,
      acao: 'criar',
      depois: usuario,
    };
    return res.status(201).json(usuario);
  } catch (err) {
    return next(err);
  }
});

/**
 * @swagger
 * /usuarios/{id}:
 *   get:
 *     summary: Detalha um usuário da unidade
 *     tags: [Usuários]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Usuário }
 *       404: { description: Não encontrado (inclui usuários de outra unidade) }
 *   patch:
 *     summary: Edita nome, e-mail ou perfil
 *     tags: [Usuários]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Usuário atualizado }
 *       400: { description: Dados inválidos }
 *       404: { description: Não encontrado }
 *       409: { description: E-mail já cadastrado }
 */
router.get('/:id', async (req, res, next) => {
  try {
    if (!idValido(req, res)) return undefined;
    res.set('Cache-Control', 'no-store');
    return res.json(await service.buscar(req.params.id, req.usuario.unidade));
  } catch (err) {
    return next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    if (!idValido(req, res)) return undefined;
    const dados = validar(editarSchema, req.body, res);
    if (!dados) return undefined;
    const { antes, depois } = await service.atualizar(
      req.usuario.unidade,
      req.params.id,
      req.usuario.id,
      dados,
    );
    res.locals.auditoria = {
      entidade: 'usuarios',
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

/**
 * @swagger
 * /usuarios/{id}/bloquear:
 *   post:
 *     summary: Bloqueia o usuário e revoga as sessões abertas
 *     tags: [Usuários]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Usuário bloqueado }
 *       400: { description: Tentativa de bloquear a si mesmo }
 *       404: { description: Não encontrado }
 * /usuarios/{id}/desbloquear:
 *   post:
 *     summary: Reativa um usuário bloqueado
 *     tags: [Usuários]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Usuário reativado }
 *       400: { description: Usuário não está bloqueado }
 *       404: { description: Não encontrado }
 * /usuarios/{id}/redefinir-senha:
 *   post:
 *     summary: Dispara o e-mail de redefinição (ou reenvia o convite)
 *     tags: [Usuários]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       204: { description: E-mail disparado }
 *       404: { description: Não encontrado }
 */
router.post('/:id/bloquear', async (req, res, next) => {
  try {
    if (!idValido(req, res)) return undefined;
    const { antes, depois } = await service.bloquear(
      req.usuario.unidade,
      req.params.id,
      req.usuario.id,
    );
    res.locals.auditoria = {
      entidade: 'usuarios',
      entidadeId: depois.id,
      acao: 'bloquear',
      antes,
      depois,
    };
    return res.json(depois);
  } catch (err) {
    return next(err);
  }
});

router.post('/:id/desbloquear', async (req, res, next) => {
  try {
    if (!idValido(req, res)) return undefined;
    const { antes, depois } = await service.desbloquear(req.usuario.unidade, req.params.id);
    res.locals.auditoria = {
      entidade: 'usuarios',
      entidadeId: depois.id,
      acao: 'desbloquear',
      antes,
      depois,
    };
    return res.json(depois);
  } catch (err) {
    return next(err);
  }
});

router.post('/:id/redefinir-senha', async (req, res, next) => {
  try {
    if (!idValido(req, res)) return undefined;
    await service.dispararRedefinicao(req.usuario.unidade, req.params.id);
    res.locals.auditoria = {
      entidade: 'usuarios',
      entidadeId: req.params.id,
      acao: 'redefinir_senha',
    };
    return res.status(204).end();
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
