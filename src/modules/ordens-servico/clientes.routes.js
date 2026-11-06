const express = require('express');
const { z } = require('zod');
const { authMiddleware, permitirPerfis, escopoUnidade } = require('../../middleware/auth');
const { csrfMiddleware } = require('../../middleware/csrf');
const { auditar } = require('../../middleware/auditoria');
const { validar, uuidOu404 } = require('../../lib/http');
const { somenteDigitos } = require('../../lib/validacoes');
const service = require('./clientes.service');
const os = require('./os.service');

const router = express.Router();

// Clientes e preços são do laboratório (RN-008): ninguém da clínica passa daqui.
router.use(authMiddleware, csrfMiddleware, escopoUnidade('laboratorio'), auditar);
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

const LABORATORIO = permitirPerfis(['laboratorio', 'adm_laboratorio']);
const ADMINISTRACAO = permitirPerfis(['adm_laboratorio']);
const idOk = (req, res) => uuidOu404(req.params.id, res, 'Cliente não encontrado.');

const texto = (max) => z.string().trim().max(max);
const clienteSchema = z
  .object({
    razao_social: texto(160).min(2),
    documento: z
      .string()
      .refine((v) => [11, 14].includes(somenteDigitos(v).length), 'Informe um CNPJ ou CPF.')
      .nullish(),
    responsavel: texto(120).nullish(),
    cro: texto(30).nullish(),
    telefone: z
      .string()
      .refine(
        (v) => [10, 11].includes(somenteDigitos(v).length),
        'Telefone deve ter DDD e 10 ou 11 dígitos.',
      )
      .nullish(),
    email: z.string().email().max(254).nullish(),
    endereco: z
      .object({
        cep: texto(9).optional(),
        logradouro: texto(120).optional(),
        numero: texto(15).optional(),
        complemento: texto(60).optional(),
        bairro: texto(80).optional(),
        cidade: texto(80).optional(),
        uf: texto(2).optional(),
      })
      .strict()
      .nullish(),
    condicao_pagamento: texto(80).nullish(),
  })
  .strict();
const editarSchema = clienteSchema
  .extend({ ativo: z.boolean() })
  .partial()
  .refine((d) => Object.keys(d).length > 0, 'Nada para alterar.');

/**
 * @swagger
 * tags:
 *   name: Laboratório
 *   description: Clientes (cadernos) e tabela de preços do laboratório
 * /laboratorio/clientes:
 *   get:
 *     summary: Clientes do laboratório — a clínica própria (interno) e os externos — com OS em aberto
 *     tags: [Laboratório]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: query, name: tipo, schema: { type: string, enum: [interno, externo] } }
 *       - { in: query, name: ativo, schema: { type: string, enum: ["true", "false", todos], default: "true" } }
 *     responses:
 *       200: { description: Lista de clientes (documento e telefone mascarados) }
 *       403: { description: Só o laboratório }
 *   post:
 *     summary: Cadastra cliente externo (CNPJ/CPF cifrado; unicidade por hash)
 *     tags: [Laboratório]
 *     security: [{ cookieAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object }
 *     responses:
 *       201: { description: Cliente criado }
 *       400: { description: Dados inválidos }
 *       409: { description: CNPJ/CPF já cadastrado }
 */
router.get('/clientes', LABORATORIO, async (req, res, next) => {
  try {
    const filtros = validar(
      z
        .object({
          tipo: z.enum(['interno', 'externo']).optional(),
          ativo: z.enum(['true', 'false', 'todos']).default('true'),
        })
        .strict(),
      req.query,
      res,
    );
    if (!filtros) return undefined;
    return res.json(await service.listar(filtros));
  } catch (err) {
    return next(err);
  }
});

router.post('/clientes', LABORATORIO, async (req, res, next) => {
  try {
    const dados = validar(clienteSchema, req.body, res);
    if (!dados) return undefined;
    const criado = await service.criar(dados);
    res.locals.auditoria = {
      entidade: 'laboratorio_clientes',
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
 * /laboratorio/clientes/{id}:
 *   get:
 *     summary: Caderno do cliente — dados, indicadores do mês, OS em produção e entregues
 *     tags: [Laboratório]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Caderno }
 *       404: { description: Não encontrado }
 *   patch:
 *     summary: Edita o cliente (a clínica própria não pode ser inativada)
 *     tags: [Laboratório]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object }
 *     responses:
 *       200: { description: Cliente atualizado }
 *       409: { description: CNPJ/CPF já cadastrado ou cliente interno }
 * /laboratorio/clientes/{id}/revelar/{campo}:
 *   get:
 *     summary: Revela documento ou telefone completo (fica na auditoria, sem o valor)
 *     tags: [Laboratório]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *       - { in: path, name: campo, required: true, schema: { type: string, enum: [documento, telefone] } }
 *     responses:
 *       200: { description: "{ campo, valor }" }
 *       400: { description: Campo não revelável }
 */
router.get('/clientes/:id', LABORATORIO, async (req, res, next) => {
  try {
    if (!idOk(req, res)) return undefined;
    return res.json(await service.caderno(req.params.id, req.usuario));
  } catch (err) {
    return next(err);
  }
});

router.patch('/clientes/:id', LABORATORIO, async (req, res, next) => {
  try {
    if (!idOk(req, res)) return undefined;
    const dados = validar(editarSchema, req.body, res);
    if (!dados) return undefined;
    const { antes, depois } = await service.atualizar(req.params.id, dados);
    res.locals.auditoria = {
      entidade: 'laboratorio_clientes',
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

router.get('/clientes/:id/revelar/:campo', LABORATORIO, async (req, res, next) => {
  try {
    if (!idOk(req, res)) return undefined;
    const valor = await service.revelar(req.params.id, req.params.campo);
    res.locals.auditoria = {
      entidade: 'laboratorio_clientes',
      entidadeId: req.params.id,
      acao: `revelar_${req.params.campo}`,
    };
    return res.json({ campo: req.params.campo, valor });
  } catch (err) {
    return next(err);
  }
});

/**
 * @swagger
 * /laboratorio/tabela-precos:
 *   get:
 *     summary: Preços vigentes por tipo de trabalho (padrão e por cliente)
 *     tags: [Laboratório]
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       200: { description: Preços vigentes }
 *       403: { description: Só a administração do laboratório (RN-007) }
 *   put:
 *     summary: Grava preços (mesma vigência substitui; vigência nova preserva o histórico)
 *     tags: [Laboratório]
 *     security: [{ cookieAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object }
 *     responses:
 *       200: { description: Preços vigentes após a gravação }
 *       400: { description: Dados inválidos }
 */
router.get('/tabela-precos', ADMINISTRACAO, async (req, res, next) => {
  try {
    return res.json(await os.listarPrecos());
  } catch (err) {
    return next(err);
  }
});

router.put('/tabela-precos', ADMINISTRACAO, async (req, res, next) => {
  try {
    const dados = validar(
      z
        .object({
          itens: z
            .array(
              z
                .object({
                  tipo_trabalho: texto(120).min(2),
                  cliente_id: z.string().uuid().nullish(),
                  valor: z.number().min(0).max(9999999),
                  vigencia_inicio: z
                    .string()
                    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato AAAA-MM-DD.')
                    .optional(),
                })
                .strict(),
            )
            .min(1)
            .max(200),
        })
        .strict(),
      req.body,
      res,
    );
    if (!dados) return undefined;
    const precos = await os.salvarPrecos(dados.itens);
    res.locals.auditoria = {
      entidade: 'tabela_precos',
      acao: 'gravar',
      depois: { itens: dados.itens },
    };
    return res.json(precos);
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
