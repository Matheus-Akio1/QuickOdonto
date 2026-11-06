const express = require('express');
const { z } = require('zod');
const { authMiddleware, permitirPerfis } = require('../../middleware/auth');
const { csrfMiddleware } = require('../../middleware/csrf');
const { auditar } = require('../../middleware/auditoria');
const { validar, uuidOu404, dataHora } = require('../../lib/http');
const service = require('./estoque.service');

const router = express.Router();

router.use(authMiddleware, csrfMiddleware, auditar);
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

// Matriz da seção 4.6. Secretaria e Clínica não entram no estoque. A unidade é sempre a do
// usuário logado (RN-008, RN-014): não existe parâmetro para olhar o estoque da outra unidade.
const OPERAR = permitirPerfis(['laboratorio', 'adm_clinica', 'adm_laboratorio']);
const ADMINISTRAR = permitirPerfis(['adm_clinica', 'adm_laboratorio']);
const ADM_LABORATORIO = permitirPerfis(['adm_laboratorio']);

const texto = (max) => z.string().trim().max(max);
const quantidade = z.number().positive().max(9999999).multipleOf(0.001);
const data = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato AAAA-MM-DD.')
  .refine((d) => !Number.isNaN(Date.parse(d)), 'Data inválida.');

const produtoSchema = z
  .object({
    nome: texto(120).min(2),
    codigo: texto(30).min(1),
    categoria: texto(60).nullish(),
    unidade_medida: texto(20).min(1),
    estoque_minimo: z.number().min(0).max(9999999).optional(),
    fornecedor: texto(120).nullish(),
  })
  .strict();
const editarProdutoSchema = produtoSchema
  .extend({ ativo: z.boolean() })
  .partial()
  .refine((d) => Object.keys(d).length > 0, 'Nada para alterar.');

const auditoria = (acao, produto, extra = {}) => ({
  entidade: 'estoque',
  entidadeId: produto.id,
  acao,
  depois: { produto: produto.nome, saldo: produto.saldo, ...extra },
});

/**
 * @swagger
 * tags:
 *   name: Estoque
 *   description: Estoque por unidade — produtos, lotes, entradas, retiradas e inventário
 * /estoque/produtos:
 *   get:
 *     summary: Produtos da unidade do usuário com saldo por lote e situação (custo só para a administração)
 *     tags: [Estoque]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: query, name: ativo, schema: { type: string, enum: ["true", "false", todos], default: "true" } }
 *     responses:
 *       200: { description: Produtos ordenados por situação }
 *       403: { description: Perfil sem acesso ao estoque }
 *   post:
 *     summary: Cadastra produto na unidade do administrador
 *     tags: [Estoque]
 *     security: [{ cookieAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object }
 *     responses:
 *       201: { description: Produto criado }
 *       400: { description: Dados inválidos }
 *       409: { description: Código já usado na unidade }
 * /estoque/produtos/{id}:
 *   patch:
 *     summary: Edita o produto (inativar exige saldo zerado)
 *     tags: [Estoque]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object }
 *     responses:
 *       200: { description: Produto atualizado }
 *       404: { description: Não encontrado (ou de outra unidade) }
 *       409: { description: Código duplicado ou produto com saldo }
 */
router.get('/produtos', OPERAR, async (req, res, next) => {
  try {
    const f = validar(
      z.object({ ativo: z.enum(['true', 'false', 'todos']).default('true') }).strict(),
      req.query,
      res,
    );
    if (!f) return undefined;
    return res.json(await service.listarProdutos(req.usuario, f));
  } catch (err) {
    return next(err);
  }
});

router.post('/produtos', ADMINISTRAR, async (req, res, next) => {
  try {
    const d = validar(produtoSchema, req.body, res);
    if (!d) return undefined;
    const criado = await service.criarProduto(d, req.usuario);
    res.locals.auditoria = auditoria('criar_produto', criado, { codigo: criado.codigo });
    return res.status(201).json(criado);
  } catch (err) {
    return next(err);
  }
});

router.patch('/produtos/:id', ADMINISTRAR, async (req, res, next) => {
  try {
    if (!uuidOu404(req.params.id, res, 'Produto não encontrado.')) return undefined;
    const d = validar(editarProdutoSchema, req.body, res);
    if (!d) return undefined;
    const { antes, depois } = await service.atualizarProduto(req.params.id, d, req.usuario);
    res.locals.auditoria = {
      entidade: 'estoque',
      entidadeId: depois.id,
      acao: 'editar_produto',
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
 * /estoque/entradas:
 *   post:
 *     summary: Entrada com lote, validade, custo e nota fiscal (técnico do laboratório depende da permissão)
 *     tags: [Estoque]
 *     security: [{ cookieAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object }
 *     responses:
 *       201: { description: Produto com o saldo e o custo médio atualizados }
 *       403: { description: Perfil sem permissão de entrada }
 *       404: { description: Produto não encontrado }
 * /estoque/retiradas:
 *   post:
 *     summary: Retirada — recusa saldo negativo (RN-005); no laboratório aceita vínculo com OS
 *     tags: [Estoque]
 *     security: [{ cookieAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object }
 *     responses:
 *       201: { description: Produto com o saldo atualizado }
 *       400: { description: Dados inválidos ou OS fechada }
 *       409: { description: Saldo insuficiente }
 * /estoque/ajustes:
 *   post:
 *     summary: Ajuste de inventário de um lote, com justificativa obrigatória
 *     tags: [Estoque]
 *     security: [{ cookieAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object }
 *     responses:
 *       201: { description: Produto com o saldo atualizado }
 *       409: { description: Saldo contado igual ao do sistema }
 */
router.post('/entradas', OPERAR, async (req, res, next) => {
  try {
    const d = validar(
      z
        .object({
          produto_id: z.string().uuid(),
          quantidade,
          lote: texto(40).nullish(),
          validade: data.nullish(),
          custo_unitario: z.number().min(0).max(9999999),
          fornecedor: texto(120).nullish(),
          nota_fiscal: texto(60).nullish(),
          lancar_financeiro: z.boolean().optional(),
        })
        .strict(),
      req.body,
      res,
    );
    if (!d) return undefined;
    const produto = await service.entrada(d, req.usuario);
    res.locals.auditoria = auditoria('entrada', produto, {
      quantidade: d.quantidade,
      lote: d.lote || null,
      nota_fiscal: d.nota_fiscal || null,
    });
    return res.status(201).json(produto);
  } catch (err) {
    return next(err);
  }
});

router.post('/retiradas', OPERAR, async (req, res, next) => {
  try {
    const d = validar(
      z
        .object({
          produto_id: z.string().uuid(),
          lote_id: z.string().uuid().nullish(),
          quantidade,
          os_id: z.string().uuid().nullish(),
          motivo: z.enum(['producao', 'uso', 'perda', 'refacao', 'vencimento']),
          observacao: texto(300).nullish(),
        })
        .strict(),
      req.body,
      res,
    );
    if (!d) return undefined;
    const produto = await service.retirada(d, req.usuario);
    res.locals.auditoria = auditoria('retirada', produto, {
      quantidade: d.quantidade,
      motivo: d.motivo,
      os_id: d.os_id || null,
    });
    return res.status(201).json(produto);
  } catch (err) {
    return next(err);
  }
});

router.post('/ajustes', ADMINISTRAR, async (req, res, next) => {
  try {
    const d = validar(
      z
        .object({
          produto_id: z.string().uuid(),
          lote_id: z.string().uuid(),
          saldo_contado: z.number().min(0).max(9999999).multipleOf(0.001),
          justificativa: texto(300).min(5),
        })
        .strict(),
      req.body,
      res,
    );
    if (!d) return undefined;
    const produto = await service.ajuste(d, req.usuario);
    res.locals.auditoria = auditoria('ajuste', produto, {
      saldo_contado: d.saldo_contado,
      justificativa: d.justificativa,
    });
    return res.status(201).json(produto);
  } catch (err) {
    return next(err);
  }
});

/**
 * @swagger
 * /estoque/movimentacoes:
 *   get:
 *     summary: Histórico de entradas, retiradas e ajustes da unidade (máx. 300, mais recentes primeiro)
 *     tags: [Estoque]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: query, name: tipo, schema: { type: string, enum: [entrada, retirada, ajuste] } }
 *       - { in: query, name: produto, schema: { type: string, format: uuid } }
 *       - { in: query, name: inicio, schema: { type: string, format: date-time } }
 *       - { in: query, name: fim, schema: { type: string, format: date-time } }
 *     responses:
 *       200: { description: Movimentações }
 * /estoque/alertas:
 *   get:
 *     summary: Produtos abaixo do mínimo e com validade em até 30 dias (ou vencidos)
 *     tags: [Estoque]
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       200: { description: "{ abaixo_minimo, vencendo }" }
 * /estoque/resumo:
 *   get:
 *     summary: Indicadores do topo da tela (valores em dinheiro só para a administração)
 *     tags: [Estoque]
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       200: { description: Indicadores }
 * /estoque/custo-por-os:
 *   get:
 *     summary: Material consumido por OS — ranking do mês ou, com os_id, o detalhe de uma OS
 *     tags: [Estoque]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: query, name: os_id, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Custo de material }
 *       403: { description: Só a administração do laboratório }
 */
router.get('/movimentacoes', OPERAR, async (req, res, next) => {
  try {
    const f = validar(
      z
        .object({
          tipo: z.enum(['entrada', 'retirada', 'ajuste']).optional(),
          produto: z.string().uuid().optional(),
          inicio: dataHora.optional(),
          fim: dataHora.optional(),
        })
        .strict(),
      req.query,
      res,
    );
    if (!f) return undefined;
    return res.json(await service.movimentacoes(f, req.usuario));
  } catch (err) {
    return next(err);
  }
});

router.get('/alertas', OPERAR, async (req, res, next) => {
  try {
    return res.json(await service.alertas(req.usuario));
  } catch (err) {
    return next(err);
  }
});

router.get('/resumo', OPERAR, async (req, res, next) => {
  try {
    return res.json(await service.resumo(req.usuario));
  } catch (err) {
    return next(err);
  }
});

router.get('/custo-por-os', ADM_LABORATORIO, async (req, res, next) => {
  try {
    const f = validar(z.object({ os_id: z.string().uuid().optional() }).strict(), req.query, res);
    if (!f) return undefined;
    return res.json(await service.custoPorOs(f.os_id));
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
