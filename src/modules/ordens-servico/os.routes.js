const express = require('express');
const multer = require('multer');
const { z } = require('zod');
const { authMiddleware, permitirPerfis } = require('../../middleware/auth');
const { csrfMiddleware } = require('../../middleware/csrf');
const { auditar } = require('../../middleware/auditoria');
const { validar, uuidOu404, dataHora } = require('../../lib/http');
const { denteValido } = require('../../lib/odonto');
const { TAMANHO_MAXIMO } = require('../../lib/arquivoCifrado');
const links = require('../../lib/links');
const service = require('./os.service');

const router = express.Router();

router.use(authMiddleware, csrfMiddleware, auditar);
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

// Matriz da seção 4.5. Negar por padrão: cada rota declara quem passa.
const LER = permitirPerfis(['secretaria', 'clinica', 'laboratorio', 'adm_laboratorio']);
const ACOMPANHAR = permitirPerfis(['secretaria', 'laboratorio', 'adm_laboratorio']);
// A Secretaria só acompanha. Quem gera a OS da clínica é o dentista; quem a conduz é o laboratório.
const CRIAR = permitirPerfis(['clinica', 'laboratorio', 'adm_laboratorio']);
const LABORATORIO = permitirPerfis(['laboratorio', 'adm_laboratorio']);

const idOk = (req, res) => uuidOu404(req.params.id, res, 'Ordem de serviço não encontrada.');

const texto = (max) => z.string().trim().max(max);
const data = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato AAAA-MM-DD.')
  .refine((d) => !Number.isNaN(Date.parse(d)), 'Data inválida.');
const elementos = z
  .array(z.number().int().refine(denteValido, 'Elemento fora da notação FDI.'))
  .max(32)
  .refine((l) => new Set(l).size === l.length, 'Elemento repetido.');

const comuns = {
  tipo_trabalho: texto(120).min(2),
  elementos: elementos.optional(),
  cor: texto(30).nullish(),
  material: texto(80).nullish(),
  observacoes: texto(2000).nullish(),
};
const propriaSchema = z
  .object({
    ...comuns,
    paciente_id: z.string().uuid(),
    profissional_id: z.string().uuid().nullish(),
    previsao_entrega: data,
  })
  .strict();
const externaSchema = z
  .object({
    ...comuns,
    cliente_id: z.string().uuid(),
    paciente_nome: texto(120).min(2),
    dentista_nome: texto(120).nullish(),
    previsao_entrega: data,
  })
  .strict();
const editarSchema = z
  .object({
    ...comuns,
    previsao_entrega: data.nullable(),
    paciente_nome: texto(120).min(2),
    dentista_nome: texto(120).nullable(),
  })
  .partial()
  .strict()
  .refine((d) => Object.keys(d).length > 0, 'Nada para alterar.');

const listaSchema = z
  .object({
    status: z.enum(['aberta', 'concluida', 'cancelada', 'todas']).default('aberta'),
    etapa: z.enum([...service.ETAPAS, ...service.PRODUCAO]).optional(),
    origem: z.enum(['propria', 'externa']).optional(),
    cliente: z.string().uuid().optional(),
    tecnico: z.string().uuid().optional(),
    profissional: z.string().uuid().optional(),
    inicio: dataHora.optional(),
    fim: dataHora.optional(),
  })
  .strict();

const etapaSchema = z
  .object({
    etapa: z.enum([...service.PRODUCAO, 'entregue']),
    observacao: texto(300).optional(),
  })
  .strict();

const auditoriaOs = (acao, antes, depois) => ({
  entidade: 'ordens_servico',
  entidadeId: depois.id,
  acao,
  antes: antes ? service.paraAuditoria(antes) : null,
  depois: service.paraAuditoria(depois),
});

const TIPOS_ANEXO = ['foto', 'escaneamento', 'documento', 'radiografia', 'outro'];
const upload = multer({
  storage: multer.memoryStorage(),
  defParamCharset: 'utf8',
  limits: { fileSize: TAMANHO_MAXIMO, files: 1, fields: 5 },
});
function receberArquivo(req, res, next) {
  upload.single('arquivo')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE')
      return res.status(413).json({ erro: 'Arquivo acima de 50 MB.' });
    return res
      .status(400)
      .json({ erro: 'Envio inválido: use multipart/form-data com o campo "arquivo".' });
  });
}

/**
 * @swagger
 * tags:
 *   name: Ordens de serviço
 *   description: OS da clínica e do laboratório — quadro, produção, provas, refações e anexos
 * /ordens-servico:
 *   get:
 *     summary: Quadro e lista. A clínica vê as próprias OS; o laboratório, as externas e as já enviadas
 *     tags: [Ordens de serviço]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: query, name: status, schema: { type: string, enum: [aberta, concluida, cancelada, todas], default: aberta } }
 *       - { in: query, name: etapa, schema: { type: string }, description: Etapa do quadro (clínica) ou da produção (laboratório) }
 *       - { in: query, name: origem, schema: { type: string, enum: [propria, externa] } }
 *       - { in: query, name: cliente, schema: { type: string, format: uuid } }
 *       - { in: query, name: tecnico, schema: { type: string, format: uuid } }
 *       - { in: query, name: profissional, schema: { type: string, format: uuid } }
 *       - { in: query, name: inicio, schema: { type: string, format: date-time } }
 *       - { in: query, name: fim, schema: { type: string, format: date-time } }
 *     responses:
 *       200: { description: Ordens de serviço (máx. 500) }
 *       400: { description: Filtros inválidos }
 *       403: { description: Sem permissão }
 *   post:
 *     summary: Cria OS — o dentista gera a da clínica, que já nasce enviada ao laboratório (RN-003, RN-013); o laboratório cria as externas
 *     tags: [Ordens de serviço]
 *     security: [{ cookieAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object }
 *     responses:
 *       201: { description: OS criada }
 *       400: { description: Dados inválidos }
 *       403: { description: Sem permissão (inclui laboratório sem a permissão de OS externa) }
 */
router.get('/', LER, async (req, res, next) => {
  try {
    const filtros = validar(listaSchema, req.query, res);
    if (!filtros) return undefined;
    return res.json(await service.listar(filtros, req.usuario));
  } catch (err) {
    return next(err);
  }
});

router.post('/', CRIAR, async (req, res, next) => {
  try {
    const lab = req.usuario.unidade === 'laboratorio';
    const dados = validar(lab ? externaSchema : propriaSchema, req.body, res);
    if (!dados) return undefined;
    const criada = lab
      ? await service.criarExterna(dados, req.usuario)
      : await service.criarPropria(dados, req.usuario);
    res.locals.auditoria = auditoriaOs('criar', null, criada);
    return res.status(201).json(criada);
  } catch (err) {
    return next(err);
  }
});

/**
 * @swagger
 * /ordens-servico/atrasadas:
 *   get:
 *     summary: Atrasadas (previsão anterior a hoje e OS aberta — RN-004) e a vencer em 3 dias
 *     tags: [Ordens de serviço]
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       200: { description: "{ atrasadas, a_vencer }" }
 * /ordens-servico/tecnicos:
 *   get:
 *     summary: Técnicos do laboratório que podem receber OS
 *     tags: [Ordens de serviço]
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       200: { description: Lista de técnicos }
 * /ordens-servico/tipos-trabalho:
 *   get:
 *     summary: Tipos de trabalho já usados ou com preço cadastrado (sugestões, sem valores)
 *     tags: [Ordens de serviço]
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       200: { description: Lista de nomes }
 */
router.get('/atrasadas', ACOMPANHAR, async (req, res, next) => {
  try {
    return res.json(await service.atrasadas(req.usuario));
  } catch (err) {
    return next(err);
  }
});

router.get('/tecnicos', LABORATORIO, async (req, res, next) => {
  try {
    return res.json(await service.tecnicos());
  } catch (err) {
    return next(err);
  }
});

router.get('/tipos-trabalho', LER, async (req, res, next) => {
  try {
    return res.json(await service.tiposTrabalho());
  } catch (err) {
    return next(err);
  }
});

/**
 * @swagger
 * /ordens-servico/{id}:
 *   get:
 *     summary: Detalhe da OS com observações, provas e refações
 *     tags: [Ordens de serviço]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: OS }
 *       404: { description: Não encontrada (ou fora do escopo da unidade) }
 *   patch:
 *     summary: Edita a OS em aberto — só o laboratório (tudo nas externas; nas da clínica, apenas o prazo)
 *     tags: [Ordens de serviço]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object }
 *     responses:
 *       200: { description: OS atualizada }
 *       400: { description: Dados inválidos }
 *       403: { description: Campo fora do alcance do perfil }
 *       409: { description: OS fechada ou já em produção }
 */
router.get('/:id', LER, async (req, res, next) => {
  try {
    if (!idOk(req, res)) return undefined;
    const os = await service.buscar(req.params.id, req.usuario);
    return res.json({
      ...os,
      historico_provas: await service.listarProvas(os.id),
      historico_refacoes: await service.listarRefacoes(os.id),
    });
  } catch (err) {
    return next(err);
  }
});

router.patch('/:id', LABORATORIO, async (req, res, next) => {
  try {
    if (!idOk(req, res)) return undefined;
    const dados = validar(editarSchema, req.body, res);
    if (!dados) return undefined;
    const { antes, depois } = await service.editar(req.params.id, dados, req.usuario);
    res.locals.auditoria = auditoriaOs('editar', antes, depois);
    return res.json(depois);
  } catch (err) {
    return next(err);
  }
});

/**
 * @swagger
 * /ordens-servico/{id}/etapa:
 *   patch:
 *     summary: Move a OS na produção (só o laboratório). "entregue" conclui a OS; o quadro da clínica acompanha sozinho
 *     tags: [Ordens de serviço]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object }
 *     responses:
 *       200: { description: OS atualizada (a mudança fica no histórico com usuário e hora — RN-012) }
 *       400: { description: Etapa inválida }
 *       409: { description: Transição não permitida ou requisito ausente }
 * /ordens-servico/{id}/cancelar:
 *   post:
 *     summary: Cancela com motivo (laboratório depende da permissão "cancelar OS")
 *     tags: [Ordens de serviço]
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
 *       200: { description: OS cancelada }
 *       403: { description: Perfil sem permissão de cancelar }
 *       409: { description: OS já fechada }
 * /ordens-servico/{id}/historico:
 *   get:
 *     summary: Histórico de etapas com usuário e data/hora (RN-012)
 *     tags: [Ordens de serviço]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Histórico em ordem cronológica }
 */
router.patch('/:id/etapa', LABORATORIO, async (req, res, next) => {
  try {
    if (!idOk(req, res)) return undefined;
    const dados = validar(etapaSchema, req.body, res);
    if (!dados) return undefined;
    const { antes, depois } = await service.mover(req.params.id, dados, req.usuario);
    res.locals.auditoria = auditoriaOs('etapa', antes, depois);
    return res.json(depois);
  } catch (err) {
    return next(err);
  }
});

router.post('/:id/cancelar', LABORATORIO, async (req, res, next) => {
  try {
    if (!idOk(req, res)) return undefined;
    const dados = validar(z.object({ motivo: texto(300).min(3) }).strict(), req.body, res);
    if (!dados) return undefined;
    const { antes, depois } = await service.cancelar(req.params.id, dados.motivo, req.usuario);
    res.locals.auditoria = auditoriaOs('cancelar', antes, depois);
    return res.json(depois);
  } catch (err) {
    return next(err);
  }
});

router.get('/:id/historico', ACOMPANHAR, async (req, res, next) => {
  try {
    if (!idOk(req, res)) return undefined;
    return res.json(await service.historico(req.params.id, req.usuario));
  } catch (err) {
    return next(err);
  }
});

/**
 * @swagger
 * /ordens-servico/{id}/tecnico:
 *   post:
 *     summary: Atribui (ou remove) o técnico responsável
 *     tags: [Ordens de serviço]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [tecnico_id]
 *             properties:
 *               tecnico_id: { type: string, format: uuid, nullable: true }
 *     responses:
 *       200: { description: OS atualizada }
 *       400: { description: Técnico inválido }
 * /ordens-servico/{id}/provas:
 *   post:
 *     summary: Registra a devolução da prova que estava na clínica (aprovada ou com ajuste)
 *     tags: [Ordens de serviço]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object }
 *     responses:
 *       200: { description: OS atualizada e lista de provas }
 *       409: { description: Sem prova em aberto }
 * /ordens-servico/{id}/refacoes:
 *   post:
 *     summary: Registra refação com motivo e devolve a OS a uma etapa de produção
 *     tags: [Ordens de serviço]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object }
 *     responses:
 *       200: { description: OS atualizada e lista de refações }
 *       409: { description: OS fechada }
 */
router.post('/:id/tecnico', LABORATORIO, async (req, res, next) => {
  try {
    if (!idOk(req, res)) return undefined;
    const dados = validar(
      z.object({ tecnico_id: z.string().uuid().nullable() }).strict(),
      req.body,
      res,
    );
    if (!dados) return undefined;
    const { antes, depois } = await service.atribuirTecnico(
      req.params.id,
      dados.tecnico_id,
      req.usuario,
    );
    res.locals.auditoria = auditoriaOs('tecnico', antes, depois);
    return res.json(depois);
  } catch (err) {
    return next(err);
  }
});

const ETAPA_PRODUCAO = z.enum(service.PRODUCAO);

router.post('/:id/provas', LABORATORIO, async (req, res, next) => {
  try {
    if (!idOk(req, res)) return undefined;
    const dados = validar(
      z
        .object({
          resultado: z.enum(['aprovada', 'ajuste']),
          motivo: texto(300).min(3).optional(),
          etapa: ETAPA_PRODUCAO.optional(),
        })
        .strict(),
      req.body,
      res,
    );
    if (!dados) return undefined;
    const { antes, depois, provas } = await service.devolverProva(
      req.params.id,
      dados,
      req.usuario,
    );
    res.locals.auditoria = auditoriaOs('prova_devolvida', antes, depois);
    return res.json({ os: depois, provas });
  } catch (err) {
    return next(err);
  }
});

router.post('/:id/refacoes', LABORATORIO, async (req, res, next) => {
  try {
    if (!idOk(req, res)) return undefined;
    const dados = validar(
      z.object({ motivo: texto(300).min(3), etapa: ETAPA_PRODUCAO.optional() }).strict(),
      req.body,
      res,
    );
    if (!dados) return undefined;
    const { antes, depois, refacoes } = await service.registrarRefacao(
      req.params.id,
      dados,
      req.usuario,
    );
    res.locals.auditoria = auditoriaOs('refacao', antes, depois);
    return res.json({ os: depois, refacoes });
  } catch (err) {
    return next(err);
  }
});

/**
 * @swagger
 * /ordens-servico/{id}/anexos:
 *   get:
 *     summary: Anexos da OS — só metadados
 *     tags: [Ordens de serviço]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Lista de anexos }
 *   post:
 *     summary: Envia foto, escaneamento ou documento (JPG, PNG, WEBP ou PDF até 50 MB) — cifrado no servidor
 *     tags: [Ordens de serviço]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [arquivo, tipo]
 *             properties:
 *               arquivo: { type: string, format: binary }
 *               tipo: { type: string, enum: [foto, escaneamento, documento, radiografia, outro] }
 *     responses:
 *       201: { description: Anexo gravado }
 *       413: { description: Acima de 50 MB }
 *       415: { description: Tipo não aceito ou conteúdo diferente do declarado }
 * /ordens-servico/{id}/anexos/{anexoId}:
 *   get:
 *     summary: Metadados do anexo + link de uso único (60 s) para visualizar/baixar
 *     tags: [Ordens de serviço]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *       - { in: path, name: anexoId, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: "Metadados e { url, expira_em }" }
 *       404: { description: Não encontrado }
 */
router.get('/:id/anexos', ACOMPANHAR, async (req, res, next) => {
  try {
    if (!idOk(req, res)) return undefined;
    return res.json(await service.listarAnexos(req.params.id, req.usuario));
  } catch (err) {
    return next(err);
  }
});

router.post('/:id/anexos', LABORATORIO, receberArquivo, async (req, res, next) => {
  try {
    if (!idOk(req, res)) return undefined;
    const d = validar(z.object({ tipo: z.enum(TIPOS_ANEXO) }).strict(), req.body, res);
    if (!d) return undefined;
    const anexo = await service.enviarAnexo(req.params.id, req.usuario, {
      tipo: d.tipo,
      file: req.file,
    });
    res.locals.auditoria = {
      entidade: 'anexos',
      entidadeId: anexo.id,
      acao: 'criar',
      depois: { os_id: req.params.id, tipo: anexo.tipo, mime: anexo.mime, tamanho: anexo.tamanho },
    };
    return res.status(201).json(anexo);
  } catch (err) {
    return next(err);
  }
});

router.get('/:id/anexos/:anexoId', ACOMPANHAR, async (req, res, next) => {
  try {
    if (!idOk(req, res)) return undefined;
    if (!uuidOu404(req.params.anexoId, res, 'Anexo não encontrado.')) return undefined;
    const meta = await service.buscarAnexo(req.params.id, req.params.anexoId, req.usuario);
    const link = await links.emitir({
      tipo: 'anexo',
      referenciaId: meta.id,
      usuarioId: req.usuario.id,
    });
    res.locals.auditoria = { entidade: 'anexos', entidadeId: meta.id, acao: 'link_os' };
    return res.json({ ...meta, ...link });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
