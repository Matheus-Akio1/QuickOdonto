const express = require('express');
const { z } = require('zod');
const { authMiddleware, permitirPerfis } = require('../../middleware/auth');
const { csrfMiddleware } = require('../../middleware/csrf');
const { auditar } = require('../../middleware/auditoria');
const { validar, uuidOu404 } = require('../../lib/http');
const links = require('../../lib/links');
const service = require('./financeiro.service');

const router = express.Router();

// RN-007 — financeiro é só da administração: nenhuma rota abaixo aceita Secretaria, Clínica ou
// Laboratório. A unidade é sempre a do usuário logado (RN-008, RN-014).
router.use(
  authMiddleware,
  csrfMiddleware,
  permitirPerfis(['adm_clinica', 'adm_laboratorio']),
  auditar,
);
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

const ADM_CLINICA = permitirPerfis(['adm_clinica']);
const ADM_LABORATORIO = permitirPerfis(['adm_laboratorio']);
const idOk = (req, res) => uuidOu404(req.params.id, res, 'Lançamento não encontrado.');

const texto = (max) => z.string().trim().max(max);
const data = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato AAAA-MM-DD.')
  .refine((d) => !Number.isNaN(Date.parse(d)), 'Data inválida.');
const valor = z.number().positive().max(99999999).multipleOf(0.01);
const forma = z.enum(service.FORMAS);
const periodo = z
  .object({ inicio: data, fim: data })
  .strict()
  .refine((p) => p.fim >= p.inicio, 'O fim deve ser igual ou depois do início.')
  .refine(
    (p) => new Date(p.fim) - new Date(p.inicio) <= 370 * 86400000,
    'Período máximo de 12 meses.',
  );

const auditoriaLanc = (acao, antes, depois) => ({
  entidade: 'lancamentos',
  entidadeId: depois.id,
  acao,
  antes,
  depois,
});

/**
 * @swagger
 * tags:
 *   name: Financeiro
 *   description: Fluxo de caixa, lançamentos, caixa do dia e extratos — só administração, por unidade
 * /financeiro/categorias:
 *   get:
 *     summary: Categorias de receita e despesa da unidade
 *     tags: [Financeiro]
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       200: { description: Categorias }
 *       403: { description: Só a administração (RN-007) }
 *   post:
 *     summary: Cria categoria na unidade
 *     tags: [Financeiro]
 *     security: [{ cookieAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object }
 *     responses:
 *       201: { description: Categoria criada }
 *       409: { description: Nome repetido }
 * /financeiro/fluxo-caixa:
 *   get:
 *     summary: Receitas, despesas e saldo — realizado, em aberto e previsto — com quebra semanal
 *     tags: [Financeiro]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: query, name: inicio, required: true, schema: { type: string, format: date } }
 *       - { in: query, name: fim, required: true, schema: { type: string, format: date } }
 *     responses:
 *       200: { description: Fluxo de caixa do período }
 *       400: { description: Período inválido }
 */
router.get('/categorias', async (req, res, next) => {
  try {
    return res.json(await service.listarCategorias(req.usuario));
  } catch (err) {
    return next(err);
  }
});

router.post('/categorias', async (req, res, next) => {
  try {
    const d = validar(
      z.object({ tipo: z.enum(['receita', 'despesa']), nome: texto(60).min(2) }).strict(),
      req.body,
      res,
    );
    if (!d) return undefined;
    const criada = await service.criarCategoria(d, req.usuario);
    res.locals.auditoria = {
      entidade: 'categorias_financeiras',
      entidadeId: criada.id,
      acao: 'criar',
      depois: criada,
    };
    return res.status(201).json(criada);
  } catch (err) {
    return next(err);
  }
});

router.get('/fluxo-caixa', async (req, res, next) => {
  try {
    const p = validar(periodo, req.query, res);
    if (!p) return undefined;
    return res.json(await service.fluxoDeCaixa(p, req.usuario));
  } catch (err) {
    return next(err);
  }
});

/**
 * @swagger
 * /financeiro/lancamentos:
 *   get:
 *     summary: Lançamentos da unidade (máx. 500) — o período olha o pagamento ou, em aberto, o vencimento
 *     tags: [Financeiro]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: query, name: tipo, schema: { type: string, enum: [receita, despesa] } }
 *       - { in: query, name: situacao, schema: { type: string, enum: [aberto, parcial, pago, cancelado, em_aberto] } }
 *       - { in: query, name: categoria, schema: { type: string, format: uuid } }
 *       - { in: query, name: cliente, schema: { type: string, format: uuid } }
 *       - { in: query, name: inicio, schema: { type: string, format: date } }
 *       - { in: query, name: fim, schema: { type: string, format: date } }
 *     responses:
 *       200: { description: Lançamentos }
 *   post:
 *     summary: Cria lançamento — parcelado (divide o valor) ou recorrente mensal (repete o valor); pode já nascer com baixa
 *     tags: [Financeiro]
 *     security: [{ cookieAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object }
 *     responses:
 *       201: { description: Lançamentos criados (um por parcela/repetição) }
 *       400: { description: Dados inválidos }
 *       409: { description: Caixa do dia fechado para a baixa informada }
 * /financeiro/lancamentos/{id}:
 *   get:
 *     summary: Detalhe do lançamento com as baixas
 *     tags: [Financeiro]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Lançamento }
 *       404: { description: Não encontrado (ou de outra unidade) }
 *   patch:
 *     summary: Edita o lançamento (com baixa, valor e vencimento ficam travados)
 *     tags: [Financeiro]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object }
 *     responses:
 *       200: { description: Lançamento atualizado }
 *       409: { description: Lançamento com baixa ou cancelado }
 * /financeiro/lancamentos/{id}/baixa:
 *   post:
 *     summary: Baixa total ou parcial — recusada se o caixa do dia estiver fechado (RN-011)
 *     tags: [Financeiro]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object }
 *     responses:
 *       200: { description: Lançamento com a baixa aplicada }
 *       409: { description: Baixa maior que o saldo, título quitado ou caixa fechado }
 * /financeiro/lancamentos/{id}/cancelar:
 *   post:
 *     summary: Cancela lançamento sem baixa, com motivo
 *     tags: [Financeiro]
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
 *       200: { description: Lançamento cancelado }
 *       409: { description: Já tem baixa ou já estava cancelado }
 */
router.get('/lancamentos', async (req, res, next) => {
  try {
    const f = validar(
      z
        .object({
          tipo: z.enum(['receita', 'despesa']).optional(),
          situacao: z.enum(['aberto', 'parcial', 'pago', 'cancelado', 'em_aberto']).optional(),
          categoria: z.string().uuid().optional(),
          cliente: z.string().uuid().optional(),
          inicio: data.optional(),
          fim: data.optional(),
        })
        .strict(),
      req.query,
      res,
    );
    if (!f) return undefined;
    return res.json(await service.listar(f, req.usuario));
  } catch (err) {
    return next(err);
  }
});

router.post('/lancamentos', async (req, res, next) => {
  try {
    const d = validar(
      z
        .object({
          tipo: z.enum(['receita', 'despesa']),
          categoria_id: z.string().uuid(),
          descricao: texto(160).min(2),
          valor,
          vencimento: data,
          forma: forma.nullish(),
          paciente_id: z.string().uuid().nullish(),
          cliente_id: z.string().uuid().nullish(),
          parcelas: z.number().int().min(1).max(36).optional(),
          recorrencia: z.enum(['mensal']).nullish(),
          repeticoes: z.number().int().min(2).max(36).optional(),
          baixa: z.object({ forma, data: data.optional() }).strict().optional(),
        })
        .strict(),
      req.body,
      res,
    );
    if (!d) return undefined;
    const criados = await service.criar(d, req.usuario);
    res.locals.auditoria = {
      entidade: 'lancamentos',
      entidadeId: criados[0].id,
      acao: 'criar',
      depois: { ...criados[0], titulos: criados.length },
    };
    return res.status(201).json(criados);
  } catch (err) {
    return next(err);
  }
});

router.get('/lancamentos/:id', async (req, res, next) => {
  try {
    if (!idOk(req, res)) return undefined;
    return res.json(await service.buscar(req.params.id, req.usuario));
  } catch (err) {
    return next(err);
  }
});

router.patch('/lancamentos/:id', async (req, res, next) => {
  try {
    if (!idOk(req, res)) return undefined;
    const d = validar(
      z
        .object({
          descricao: texto(160).min(2),
          categoria_id: z.string().uuid(),
          valor,
          vencimento: data,
          forma: forma.nullable(),
        })
        .partial()
        .strict()
        .refine((x) => Object.keys(x).length > 0, 'Nada para alterar.'),
      req.body,
      res,
    );
    if (!d) return undefined;
    const { antes, depois } = await service.editar(req.params.id, d, req.usuario);
    res.locals.auditoria = auditoriaLanc('editar', antes, depois);
    return res.json(depois);
  } catch (err) {
    return next(err);
  }
});

router.post('/lancamentos/:id/baixa', async (req, res, next) => {
  try {
    if (!idOk(req, res)) return undefined;
    const d = validar(
      z.object({ valor: valor.optional(), forma, data: data.optional() }).strict(),
      req.body,
      res,
    );
    if (!d) return undefined;
    const { antes, depois } = await service.darBaixa(req.params.id, d, req.usuario);
    res.locals.auditoria = auditoriaLanc('baixa', antes, depois);
    return res.json(depois);
  } catch (err) {
    return next(err);
  }
});

router.post('/lancamentos/:id/cancelar', async (req, res, next) => {
  try {
    if (!idOk(req, res)) return undefined;
    const d = validar(z.object({ motivo: texto(300).min(3) }).strict(), req.body, res);
    if (!d) return undefined;
    const { antes, depois } = await service.cancelar(req.params.id, d.motivo, req.usuario);
    res.locals.auditoria = auditoriaLanc('cancelar', antes, depois);
    return res.json(depois);
  } catch (err) {
    return next(err);
  }
});

/**
 * @swagger
 * /financeiro/contas-receber:
 *   get:
 *     summary: Títulos a receber em aberto, por vencimento (no laboratório, também agrupados por cliente)
 *     tags: [Financeiro]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: query, name: inicio, schema: { type: string, format: date } }
 *       - { in: query, name: fim, schema: { type: string, format: date } }
 *     responses:
 *       200: { description: "{ total, atrasado, itens, por_cliente }" }
 * /financeiro/contas-pagar:
 *   get:
 *     summary: Títulos a pagar em aberto, por vencimento
 *     tags: [Financeiro]
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       200: { description: "{ total, atrasado, itens }" }
 */
router.get('/contas-receber', async (req, res, next) => {
  try {
    const r = await service.emAberto('receita', req.usuario);
    if (req.usuario.unidade === 'laboratorio' && req.query.inicio) {
      const p = validar(periodo, req.query, res);
      if (!p) return undefined;
      r.por_cliente = await service.aReceberPorCliente(req.usuario, p);
    }
    return res.json(r);
  } catch (err) {
    return next(err);
  }
});

router.get('/contas-pagar', async (req, res, next) => {
  try {
    return res.json(await service.emAberto('despesa', req.usuario));
  } catch (err) {
    return next(err);
  }
});

/**
 * @swagger
 * /financeiro/caixa/hoje:
 *   get:
 *     summary: Caixa do dia da clínica — totais por forma de pagamento, entradas e saídas
 *     tags: [Financeiro]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: query, name: data, schema: { type: string, format: date }, description: Outro dia (padrão hoje) }
 *     responses:
 *       200: { description: Caixa do dia }
 *       403: { description: Só a administração da clínica }
 * /financeiro/caixa/fechamentos:
 *   get:
 *     summary: Fechamentos de caixa dos últimos 60 dias
 *     tags: [Financeiro]
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       200: { description: Fechamentos }
 * /financeiro/caixa/fechar:
 *   post:
 *     summary: Fecha o caixa do dia e guarda os totais — depois disso nenhuma baixa do dia entra (RN-011)
 *     tags: [Financeiro]
 *     security: [{ cookieAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object }
 *     responses:
 *       200: { description: Caixa fechado }
 *       409: { description: Já estava fechado }
 * /financeiro/caixa/{id}/reabrir:
 *   post:
 *     summary: Reabre o caixa com justificativa obrigatória (RN-011)
 *     tags: [Financeiro]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [justificativa]
 *             properties:
 *               justificativa: { type: string }
 *     responses:
 *       200: { description: Caixa reaberto }
 *       400: { description: Justificativa ausente }
 *       409: { description: Já estava aberto }
 */
router.get('/caixa/hoje', ADM_CLINICA, async (req, res, next) => {
  try {
    const q = validar(z.object({ data: data.optional() }).strict(), req.query, res);
    if (!q) return undefined;
    return res.json(await service.caixaDoDia(req.usuario, q.data));
  } catch (err) {
    return next(err);
  }
});

router.get('/caixa/fechamentos', ADM_CLINICA, async (req, res, next) => {
  try {
    return res.json(await service.fechamentos(req.usuario));
  } catch (err) {
    return next(err);
  }
});

router.post('/caixa/fechar', ADM_CLINICA, async (req, res, next) => {
  try {
    const d = validar(z.object({ data: data.optional() }).strict(), req.body || {}, res);
    if (!d) return undefined;
    const caixa = await service.fecharCaixa(req.usuario, d.data);
    res.locals.auditoria = {
      entidade: 'caixas_diarios',
      entidadeId: caixa.id,
      acao: 'fechar',
      depois: { data: caixa.data, totais: caixa.totais },
    };
    return res.json(caixa);
  } catch (err) {
    return next(err);
  }
});

router.post('/caixa/:id/reabrir', ADM_CLINICA, async (req, res, next) => {
  try {
    if (!uuidOu404(req.params.id, res, 'Fechamento de caixa não encontrado.')) return undefined;
    const d = validar(z.object({ justificativa: texto(300).min(5) }).strict(), req.body, res);
    if (!d) return undefined;
    const caixa = await service.reabrirCaixa(req.params.id, d.justificativa, req.usuario);
    res.locals.auditoria = {
      entidade: 'caixas_diarios',
      entidadeId: req.params.id,
      acao: 'reabrir',
      depois: { data: caixa.data, justificativa: d.justificativa },
    };
    return res.json(caixa);
  } catch (err) {
    return next(err);
  }
});

/**
 * @swagger
 * /financeiro/extratos/{clienteId}:
 *   get:
 *     summary: Extrato mensal de um cliente do laboratório — OS concluídas, resumo por tipo e pagamento
 *     tags: [Financeiro]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: path, name: clienteId, required: true, schema: { type: string, format: uuid } }
 *       - { in: query, name: mes, schema: { type: string }, description: AAAA-MM (padrão mês atual) }
 *     responses:
 *       200: { description: Extrato }
 *       403: { description: Só a administração do laboratório }
 *       404: { description: Cliente não encontrado }
 * /financeiro/extratos/{clienteId}/pdf:
 *   post:
 *     summary: Gera o link de uso único (60 s) do extrato em PDF
 *     tags: [Financeiro]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: path, name: clienteId, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object }
 *     responses:
 *       200: { description: "{ url, expira_em }" }
 * /financeiro/recibos/{lancamentoId}:
 *   post:
 *     summary: Gera o link de uso único (60 s) do recibo em PDF — receita da clínica com valor recebido
 *     tags: [Financeiro]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: path, name: lancamentoId, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: "{ url, expira_em }" }
 *       409: { description: Lançamento sem valor recebido ou que não é receita }
 */
const mesSchema = z
  .object({
    mes: z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Mês no formato AAAA-MM.')
      .optional(),
  })
  .strict();

router.get('/extratos/:clienteId', ADM_LABORATORIO, async (req, res, next) => {
  try {
    if (!uuidOu404(req.params.clienteId, res, 'Cliente não encontrado.')) return undefined;
    const q = validar(mesSchema, req.query, res);
    if (!q) return undefined;
    return res.json(await service.extrato(req.params.clienteId, q.mes));
  } catch (err) {
    return next(err);
  }
});

router.post('/extratos/:clienteId/pdf', ADM_LABORATORIO, async (req, res, next) => {
  try {
    if (!uuidOu404(req.params.clienteId, res, 'Cliente não encontrado.')) return undefined;
    const q = validar(mesSchema, req.body || {}, res);
    if (!q) return undefined;
    await service.extrato(req.params.clienteId, q.mes); // 404 antes de emitir o link
    const link = await links.emitir({
      tipo: 'extrato_pdf',
      referenciaId: req.params.clienteId,
      usuarioId: req.usuario.id,
      parametro: q.mes || null,
    });
    res.locals.auditoria = {
      entidade: 'laboratorio_clientes',
      entidadeId: req.params.clienteId,
      acao: 'extrato_pdf',
    };
    return res.json(link);
  } catch (err) {
    return next(err);
  }
});

router.post('/recibos/:lancamentoId', ADM_CLINICA, async (req, res, next) => {
  try {
    if (!uuidOu404(req.params.lancamentoId, res, 'Lançamento não encontrado.')) return undefined;
    const l = await service.buscar(req.params.lancamentoId, req.usuario);
    if (l.tipo !== 'receita') throw service.erro(409, 'Recibo só existe para receitas.');
    if (!(l.valor_pago > 0)) {
      throw service.erro(409, 'Este lançamento ainda não tem valor recebido.');
    }
    const link = await links.emitir({
      tipo: 'recibo_pdf',
      referenciaId: l.id,
      usuarioId: req.usuario.id,
    });
    res.locals.auditoria = { entidade: 'lancamentos', entidadeId: l.id, acao: 'recibo_pdf' };
    return res.json(link);
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
