const express = require('express');
const { z } = require('zod');
const { validar, uuidOu404 } = require('../../lib/http');
const { FACES, denteValido } = require('../../lib/odonto');
const { BASE, CLINICA, CLINICA_OU_ADM, acesso } = require('./prontuario.routes');
const prontuario = require('./prontuario.service');
const service = require('./procedimentos.service');

const dente = z
  .number()
  .int()
  .refine(denteValido, 'Dente inválido (use a numeração FDI, ex.: 11, 36, 55).');
const faces = z
  .array(z.enum(FACES))
  .max(6)
  .refine((f) => new Set(f).size === f.length, 'Faces repetidas.');
const dataPassada = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato AAAA-MM-DD.')
  .refine(
    (d) => !Number.isNaN(Date.parse(d)) && new Date(d) <= new Date(),
    'A data não pode ser futura.',
  );
const valor = z.number().min(0).max(1_000_000);
const facesExigemDente = (d) => !(d.faces?.length && !d.dente);

const catalogoSchema = z
  .object({
    codigo: z.string().trim().min(1).max(20),
    nome: z.string().trim().min(2).max(120),
    especialidade: z.string().trim().max(60).nullish(),
    duracao_min: z.number().int().min(5).max(480).default(30),
    valor_padrao: valor.default(0),
  })
  .strict();
const catalogoEdicao = z
  .object({
    codigo: z.string().trim().min(1).max(20),
    nome: z.string().trim().min(2).max(120),
    especialidade: z.string().trim().max(60).nullable(),
    duracao_min: z.number().int().min(5).max(480),
    valor_padrao: valor,
    ativo: z.boolean(),
  })
  .partial()
  .strict()
  .refine((d) => Object.keys(d).length > 0, 'Nada para alterar.');
const listaCatalogo = z.object({
  busca: z.string().trim().max(60).optional(),
  ativo: z.enum(['true', 'false', 'todos']).default('true'),
});

const procedimentoSchema = z
  .object({
    catalogo_id: z.string().uuid(),
    dente: dente.nullish(),
    faces: faces.default([]),
    status: z.enum(['planejado', 'em_andamento', 'concluido']).default('planejado'),
    data: dataPassada.nullish(),
    valor: valor.nullish(),
    observacao: z.string().trim().max(2000).nullish(),
  })
  .strict()
  .refine(facesExigemDente, 'Faces exigem o dente.');
const procedimentoEdicao = z
  .object({
    dente: dente.nullable(),
    faces,
    status: z.enum(['planejado', 'em_andamento', 'concluido', 'cancelado']),
    data: dataPassada.nullable(),
    valor,
    observacao: z.string().trim().max(2000).nullable(),
    adendo: z.string().trim().min(3).max(2000),
  })
  .partial()
  .strict()
  .refine((d) => Object.keys(d).length > 0, 'Nada para alterar.');

const planoSchema = z
  .object({
    paciente_id: z.string().uuid(),
    observacao: z.string().trim().max(2000).nullish(),
    itens: z
      .array(
        z
          .object({
            catalogo_id: z.string().uuid(),
            dente: dente.nullish(),
            faces: faces.default([]),
            valor: valor.nullish(),
          })
          .strict()
          .refine(facesExigemDente, 'Faces exigem o dente.'),
      )
      .min(1, 'Inclua ao menos um procedimento.')
      .max(50),
  })
  .strict();

/* ------------------------------ /procedimentos (catálogo) ------------------------------ */

const catalogo = express.Router();
catalogo.use(BASE, CLINICA_OU_ADM);

/**
 * @swagger
 * tags:
 *   name: Procedimentos
 *   description: Catálogo, procedimentos por dente/face, odontograma e planos de tratamento
 * /procedimentos:
 *   get:
 *     summary: Catálogo de procedimentos (Clínica e Adm. Clínica)
 *     tags: [Procedimentos]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: query, name: busca, schema: { type: string } }
 *       - { in: query, name: ativo, schema: { type: string, enum: ['true', 'false', todos], default: 'true' } }
 *     responses:
 *       200: { description: Itens do catálogo }
 *   post:
 *     summary: Cadastra item do catálogo
 *     tags: [Procedimentos]
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       201: { description: Criado }
 *       400: { description: Dados inválidos }
 *       409: { description: Código já usado }
 * /procedimentos/{id}:
 *   patch:
 *     summary: Edita item do catálogo (inclusive ativar/inativar)
 *     tags: [Procedimentos]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Atualizado }
 *       404: { description: Não encontrado }
 *       409: { description: Código já usado }
 */
catalogo.get('/', async (req, res, next) => {
  try {
    const f = validar(listaCatalogo, req.query, res);
    if (!f) return undefined;
    return res.json(await service.listarCatalogo(f));
  } catch (err) {
    return next(err);
  }
});

catalogo.post('/', async (req, res, next) => {
  try {
    const d = validar(catalogoSchema, req.body, res);
    if (!d) return undefined;
    const criado = await service.criarCatalogo(d);
    res.locals.auditoria = {
      entidade: 'procedimentos_catalogo',
      entidadeId: criado.id,
      acao: 'criar',
      depois: criado,
    };
    return res.status(201).json(criado);
  } catch (err) {
    return next(err);
  }
});

catalogo.patch('/:id', async (req, res, next) => {
  try {
    if (!uuidOu404(req.params.id, res, 'Procedimento do catálogo não encontrado.'))
      return undefined;
    const d = validar(catalogoEdicao, req.body, res);
    if (!d) return undefined;
    const { antes, depois } = await service.atualizarCatalogo(req.params.id, d);
    res.locals.auditoria = {
      entidade: 'procedimentos_catalogo',
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

/* ---------------------- /pacientes/:id/procedimentos e odontograma ---------------------- */

const pacientes = express.Router();
pacientes.use(BASE);

/**
 * @swagger
 * /pacientes/{id}/procedimentos:
 *   get:
 *     summary: Procedimentos do paciente com adendos (acesso registrado)
 *     tags: [Procedimentos]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Lista }
 *   post:
 *     summary: Registra procedimento por dente (FDI) e faces (V, L, M, D, O, I)
 *     tags: [Procedimentos]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       201: { description: Registrado }
 *       400: { description: Dente/face inválido ou catálogo inativo }
 * /pacientes/{id}/odontograma:
 *   get:
 *     summary: Situação por elemento dentário (acesso registrado)
 *     tags: [Procedimentos]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Mapa dente → situação e procedimentos }
 */
pacientes.get('/:id/procedimentos', CLINICA, async (req, res, next) => {
  try {
    if (!uuidOu404(req.params.id, res, 'Paciente não encontrado.')) return undefined;
    await prontuario.buscarPaciente(req.params.id);
    await acesso(req, req.params.id, 'procedimentos');
    return res.json(await service.listarProcedimentos(req.params.id));
  } catch (err) {
    return next(err);
  }
});

pacientes.post('/:id/procedimentos', CLINICA, async (req, res, next) => {
  try {
    if (!uuidOu404(req.params.id, res, 'Paciente não encontrado.')) return undefined;
    const d = validar(procedimentoSchema, req.body, res);
    if (!d) return undefined;
    const profissionalId = await prontuario.profissionalDoUsuario(req.usuario.id);
    const criado = await service.criarProcedimento(req.params.id, profissionalId, d);
    res.locals.auditoria = {
      entidade: 'procedimentos_paciente',
      entidadeId: criado.id,
      acao: 'criar',
      depois: {
        paciente_id: criado.paciente_id,
        catalogo: criado.catalogo.codigo,
        dente: criado.dente,
        status: criado.status,
      },
    };
    return res.status(201).json(criado);
  } catch (err) {
    return next(err);
  }
});

pacientes.get('/:id/odontograma', CLINICA, async (req, res, next) => {
  try {
    if (!uuidOu404(req.params.id, res, 'Paciente não encontrado.')) return undefined;
    await prontuario.buscarPaciente(req.params.id);
    await acesso(req, req.params.id, 'odontograma');
    return res.json(await service.odontograma(req.params.id));
  } catch (err) {
    return next(err);
  }
});

/* ------------------------- /procedimentos-paciente/:id ------------------------- */

const procedimentosPaciente = express.Router();
procedimentosPaciente.use(BASE, CLINICA);

/**
 * @swagger
 * /procedimentos-paciente/{id}:
 *   patch:
 *     summary: Edita procedimento aberto; concluído ou cancelado só aceita adendo (RN-006)
 *     tags: [Procedimentos]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Atualizado }
 *       400: { description: Dados inválidos }
 *       404: { description: Não encontrado }
 *       409: { description: Transição inválida ou procedimento fechado (só adendo) }
 */
procedimentosPaciente.patch('/:id', async (req, res, next) => {
  try {
    if (!uuidOu404(req.params.id, res, 'Procedimento não encontrado.')) return undefined;
    const d = validar(procedimentoEdicao, req.body, res);
    if (!d) return undefined;
    const profissionalId = await prontuario.profissionalDoUsuario(req.usuario.id);
    const { antes, depois } = await service.atualizarProcedimento(
      req.params.id,
      req.usuario.id,
      profissionalId,
      d,
    );
    const resumo = (p) => ({
      status: p.status,
      dente: p.dente,
      faces: p.faces,
      data: p.data,
      valor: p.valor,
    });
    res.locals.auditoria = {
      entidade: 'procedimentos_paciente',
      entidadeId: depois.id,
      acao: d.adendo && Object.keys(d).length === 1 ? 'adendo' : 'editar',
      antes: resumo(antes),
      depois: { ...resumo(depois), adendos: depois.adendos.length },
    };
    return res.json(depois);
  } catch (err) {
    return next(err);
  }
});

/* ------------------------------- /planos-tratamento ------------------------------- */

const planos = express.Router();
planos.use(BASE, CLINICA_OU_ADM);

/**
 * @swagger
 * /planos-tratamento:
 *   get:
 *     summary: Planos de tratamento (orçamentos) de um paciente
 *     tags: [Procedimentos]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: query, name: paciente_id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Planos com itens e total }
 *   post:
 *     summary: Cria plano de tratamento (orçamento) com itens do catálogo
 *     tags: [Procedimentos]
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       201: { description: Criado como rascunho }
 *       400: { description: Itens inválidos }
 * /planos-tratamento/{id}:
 *   get:
 *     summary: Detalha o plano
 *     tags: [Procedimentos]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Plano }
 *       404: { description: Não encontrado }
 * /planos-tratamento/{id}/aprovar:
 *   post:
 *     summary: Aprova o orçamento e lança os itens no prontuário como procedimentos planejados
 *     tags: [Procedimentos]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Aprovado }
 *       409: { description: Já aprovado }
 */
planos.get('/', async (req, res, next) => {
  try {
    const q = validar(z.object({ paciente_id: z.string().uuid() }), req.query, res);
    if (!q) return undefined;
    await prontuario.buscarPaciente(q.paciente_id);
    // O plano traz observação clínica decifrada: a leitura entra na trilha de acesso.
    await acesso(req, q.paciente_id, 'planos');
    return res.json(await service.listarPlanos(q.paciente_id));
  } catch (err) {
    return next(err);
  }
});

planos.post('/', async (req, res, next) => {
  try {
    const d = validar(planoSchema, req.body, res);
    if (!d) return undefined;
    const profissionalId =
      req.usuario.perfil === 'clinica'
        ? await prontuario.profissionalDoUsuario(req.usuario.id)
        : null;
    const plano = await service.criarPlano(d, req.usuario.id, profissionalId);
    res.locals.auditoria = {
      entidade: 'planos_tratamento',
      entidadeId: plano.id,
      acao: 'criar',
      depois: { paciente_id: plano.paciente_id, itens: plano.itens.length, total: plano.total },
    };
    return res.status(201).json(plano);
  } catch (err) {
    return next(err);
  }
});

planos.get('/:id', async (req, res, next) => {
  try {
    if (!uuidOu404(req.params.id, res, 'Plano de tratamento não encontrado.')) return undefined;
    const plano = await service.buscarPlano(req.params.id);
    await acesso(req, plano.paciente_id, 'plano');
    return res.json(plano);
  } catch (err) {
    return next(err);
  }
});

planos.post('/:id/aprovar', async (req, res, next) => {
  try {
    if (!uuidOu404(req.params.id, res, 'Plano de tratamento não encontrado.')) return undefined;
    const { antes, depois } = await service.aprovarPlano(req.params.id, req.usuario.id);
    res.locals.auditoria = {
      entidade: 'planos_tratamento',
      entidadeId: depois.id,
      acao: 'aprovar',
      antes: { status: antes.status },
      depois: { status: depois.status, total: depois.total, itens: depois.itens.length },
    };
    return res.json(depois);
  } catch (err) {
    return next(err);
  }
});

module.exports = { catalogo, pacientes, procedimentosPaciente, planos };
