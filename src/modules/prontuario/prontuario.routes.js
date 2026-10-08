const express = require('express');
const { z } = require('zod');
const { authMiddleware, permitirPerfis, escopoUnidade } = require('../../middleware/auth');
const { csrfMiddleware } = require('../../middleware/csrf');
const { auditar } = require('../../middleware/auditoria');
const { validar, uuidOu404 } = require('../../lib/http');
const links = require('../../lib/links');
const service = require('./prontuario.service');

/** Cadeia comum: autenticado, CSRF nas escritas, unidade clínica, auditoria e sem cache. */
const BASE = [
  authMiddleware,
  csrfMiddleware,
  escopoUnidade('clinica'),
  auditar,
  (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  },
];
const CLINICA = permitirPerfis(['clinica']);
const CLINICA_OU_ADM = permitirPerfis(['clinica', 'adm_clinica']);

const pacienteOk = (req, res) => uuidOu404(req.params.id, res, 'Paciente não encontrado.');
const acesso = (req, pacienteId, recurso) =>
  service.registrarAcesso({ pacienteId, usuarioId: req.usuario.id, recurso, ip: req.ip });

const paginacao = z.object({
  pagina: z.coerce.number().int().min(1).default(1),
  limite: z.coerce.number().int().min(1).max(100).default(20),
});

const ALERTA_TIPOS = ['alergia', 'medicamento', 'condicao', 'outro'];
const anamneseSchema = z
  .object({
    respostas: z
      .record(
        z.string().min(1).max(60),
        z.union([
          z.string().max(2000),
          z.boolean(),
          z.number(),
          z.array(z.string().max(300)).max(50),
        ]),
      )
      .refine((r) => Object.keys(r).length <= 80, 'No máximo 80 perguntas por anamnese.'),
    alertas: z
      .array(
        z
          .object({ tipo: z.enum(ALERTA_TIPOS), descricao: z.string().trim().min(2).max(300) })
          .strict(),
      )
      .max(30)
      .default([]),
  })
  .strict()
  .refine((d) => JSON.stringify(d).length <= 30000, 'Anamnese muito grande.');

const evolucaoSchema = z
  .object({
    conteudo: z.string().trim().min(3).max(10000),
    consulta_id: z.string().uuid().nullish(),
  })
  .strict();
const adendoSchema = z.object({ conteudo: z.string().trim().min(3).max(5000) }).strict();

/* ------------------------- /pacientes/:id/... ------------------------- */

const pacientes = express.Router();
pacientes.use(BASE);

/**
 * @swagger
 * tags:
 *   name: Prontuário
 *   description: Prontuário clínico — texto clínico cifrado; toda leitura fica registrada (RF-CLI-015)
 * /pacientes/{id}/prontuario:
 *   get:
 *     summary: Resumo do prontuário — alertas, anamnese atual e linha do tempo (acesso registrado)
 *     tags: [Prontuário]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Resumo }
 *       403: { description: Somente o perfil Clínica (dentista) }
 *       404: { description: Paciente não encontrado }
 * /pacientes/{id}/anamneses:
 *   get:
 *     summary: Versões da anamnese (só metadados; acesso registrado)
 *     tags: [Prontuário]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Lista de versões }
 *   post:
 *     summary: Registra NOVA versão da anamnese (nunca sobrescreve — RF-CLI-003)
 *     tags: [Prontuário]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       201: { description: Versão criada }
 *       400: { description: Dados inválidos }
 *       403: { description: Usuário não é profissional ativo }
 * /pacientes/{id}/evolucoes:
 *   get:
 *     summary: Evoluções clínicas com adendos (acesso registrado)
 *     tags: [Prontuário]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *       - { in: query, name: pagina, schema: { type: integer, default: 1 } }
 *       - { in: query, name: limite, schema: { type: integer, default: 20, maximum: 100 } }
 *     responses:
 *       200: { description: Página de evoluções }
 *   post:
 *     summary: Registra evolução (sem edição nem exclusão — RN-006)
 *     tags: [Prontuário]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       201: { description: Evolução registrada }
 *       400: { description: Dados inválidos ou consulta de outro paciente }
 * /pacientes/{id}/acessos:
 *   get:
 *     summary: Quem abriu o prontuário, quando e o quê (Clínica e Adm. Clínica)
 *     tags: [Prontuário]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *       - { in: query, name: pagina, schema: { type: integer, default: 1 } }
 *       - { in: query, name: limite, schema: { type: integer, default: 20, maximum: 100 } }
 *     responses:
 *       200: { description: Página de acessos }
 * /pacientes/{id}/prontuario/pdf:
 *   get:
 *     summary: Link de uso único (60 s) para baixar o prontuário em PDF, gerado no servidor
 *     tags: [Prontuário]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: "{ url, expira_em }" }
 *       404: { description: Paciente não encontrado }
 */
pacientes.get('/:id/prontuario', CLINICA, async (req, res, next) => {
  try {
    if (!pacienteOk(req, res)) return undefined;
    await service.buscarPaciente(req.params.id);
    await acesso(req, req.params.id, 'prontuario');
    return res.json(await service.resumoProntuario(req.params.id));
  } catch (err) {
    return next(err);
  }
});

pacientes.get('/:id/anamneses', CLINICA, async (req, res, next) => {
  try {
    if (!pacienteOk(req, res)) return undefined;
    await service.buscarPaciente(req.params.id);
    await acesso(req, req.params.id, 'anamneses');
    return res.json(await service.listarAnamneses(req.params.id));
  } catch (err) {
    return next(err);
  }
});

pacientes.post('/:id/anamneses', CLINICA, async (req, res, next) => {
  try {
    if (!pacienteOk(req, res)) return undefined;
    const dados = validar(anamneseSchema, req.body, res);
    if (!dados) return undefined;
    const profissionalId = await service.profissionalDoUsuario(req.usuario.id);
    const criada = await service.criarAnamnese(req.params.id, profissionalId, dados);
    res.locals.auditoria = {
      entidade: 'anamneses',
      entidadeId: criada.id,
      acao: 'criar',
      depois: { paciente_id: req.params.id, versao: criada.versao, alertas: dados.alertas.length },
    };
    return res.status(201).json(criada);
  } catch (err) {
    return next(err);
  }
});

pacientes.get('/:id/evolucoes', CLINICA, async (req, res, next) => {
  try {
    if (!pacienteOk(req, res)) return undefined;
    const pag = validar(paginacao, req.query, res);
    if (!pag) return undefined;
    await service.buscarPaciente(req.params.id);
    await acesso(req, req.params.id, 'evolucoes');
    return res.json(await service.listarEvolucoes(req.params.id, pag));
  } catch (err) {
    return next(err);
  }
});

pacientes.post('/:id/evolucoes', CLINICA, async (req, res, next) => {
  try {
    if (!pacienteOk(req, res)) return undefined;
    const dados = validar(evolucaoSchema, req.body, res);
    if (!dados) return undefined;
    const profissionalId = await service.profissionalDoUsuario(req.usuario.id);
    const criada = await service.criarEvolucao(req.params.id, profissionalId, dados);
    res.locals.auditoria = {
      entidade: 'evolucoes',
      entidadeId: criada.id,
      acao: 'criar',
      depois: { paciente_id: req.params.id, caracteres: dados.conteudo.length },
    };
    return res.status(201).json(criada);
  } catch (err) {
    return next(err);
  }
});

pacientes.get('/:id/acessos', CLINICA_OU_ADM, async (req, res, next) => {
  try {
    if (!pacienteOk(req, res)) return undefined;
    const pag = validar(paginacao, req.query, res);
    if (!pag) return undefined;
    return res.json(await service.listarAcessos(req.params.id, pag));
  } catch (err) {
    return next(err);
  }
});

pacientes.get('/:id/prontuario/pdf', CLINICA, async (req, res, next) => {
  try {
    if (!pacienteOk(req, res)) return undefined;
    await service.buscarPaciente(req.params.id);
    await acesso(req, req.params.id, 'pdf_solicitado');
    const link = await links.emitir({
      tipo: 'prontuario_pdf',
      referenciaId: req.params.id,
      usuarioId: req.usuario.id,
    });
    res.locals.auditoria = {
      entidade: 'pacientes',
      entidadeId: req.params.id,
      acao: 'exportar_prontuario_pdf',
    };
    return res.json(link);
  } catch (err) {
    return next(err);
  }
});

/* ------------------------------ /anamneses ------------------------------ */

const anamneses = express.Router();
anamneses.use(BASE);

/**
 * @swagger
 * /anamneses/{id}:
 *   get:
 *     summary: Conteúdo de uma versão da anamnese (acesso registrado)
 *     tags: [Prontuário]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Anamnese }
 *       404: { description: Não encontrada }
 * /anamneses/{id}/assinatura:
 *   post:
 *     summary: Assina a anamnese (só o autor, uma única vez)
 *     tags: [Prontuário]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Anamnese assinada }
 *       403: { description: Não é o autor }
 *       409: { description: Já assinada }
 */
anamneses.get('/:id', CLINICA, async (req, res, next) => {
  try {
    if (!uuidOu404(req.params.id, res, 'Anamnese não encontrada.')) return undefined;
    const a = await service.buscarAnamnese(req.params.id);
    await acesso(req, a.paciente_id, 'anamnese');
    return res.json(a);
  } catch (err) {
    return next(err);
  }
});

anamneses.post('/:id/assinatura', CLINICA, async (req, res, next) => {
  try {
    if (!uuidOu404(req.params.id, res, 'Anamnese não encontrada.')) return undefined;
    const profissionalId = await service.profissionalDoUsuario(req.usuario.id);
    const a = await service.assinarAnamnese(req.params.id, profissionalId);
    res.locals.auditoria = {
      entidade: 'anamneses',
      entidadeId: a.id,
      acao: 'assinar',
      depois: { paciente_id: a.paciente_id, versao: a.versao, assinada_em: a.assinada_em },
    };
    return res.json(a);
  } catch (err) {
    return next(err);
  }
});

/* ------------------------------ /evolucoes ------------------------------ */

const evolucoes = express.Router();
evolucoes.use(BASE);

/**
 * @swagger
 * /evolucoes/{id}/adendos:
 *   post:
 *     summary: Corrige/complementa uma evolução por adendo (RN-006 — o texto original não muda)
 *     tags: [Prontuário]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       201: { description: Adendo registrado }
 *       404: { description: Evolução não encontrada }
 */
evolucoes.post('/:id/adendos', CLINICA, async (req, res, next) => {
  try {
    if (!uuidOu404(req.params.id, res, 'Evolução não encontrada.')) return undefined;
    const dados = validar(adendoSchema, req.body, res);
    if (!dados) return undefined;
    const profissionalId = await service.profissionalDoUsuario(req.usuario.id);
    const a = await service.criarAdendo(req.params.id, profissionalId, dados.conteudo);
    res.locals.auditoria = {
      entidade: 'adendos',
      entidadeId: a.id,
      acao: 'criar',
      depois: {
        evolucao_id: a.evolucao_id,
        paciente_id: a.paciente_id,
        caracteres: dados.conteudo.length,
      },
    };
    return res.status(201).json(a);
  } catch (err) {
    return next(err);
  }
});

module.exports = { pacientes, anamneses, evolucoes, BASE, CLINICA, CLINICA_OU_ADM, acesso };
