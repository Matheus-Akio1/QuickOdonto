const express = require('express');
const ExcelJS = require('exceljs');
const { z } = require('zod');
const { authMiddleware, permitirPerfis, escopoUnidade } = require('../../middleware/auth');
const { csrfMiddleware } = require('../../middleware/csrf');
const { auditar } = require('../../middleware/auditoria');
const { cpfValido, somenteDigitos } = require('../../lib/validacoes');
const service = require('./pacientes.service');

const router = express.Router();

router.use(authMiddleware, csrfMiddleware, escopoUnidade('clinica'), auditar);
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

const LER = permitirPerfis(['secretaria', 'clinica']);
const ESCREVER = permitirPerfis(['secretaria']);

const opcional = (schema) => schema.nullish();
const texto = (max) => z.string().trim().max(max);
const celular = z
  .string()
  .refine(
    (v) => [10, 11].includes(somenteDigitos(v).length),
    'Celular deve ter DDD e 10 ou 11 dígitos.',
  );

const pacienteSchema = z
  .object({
    nome: texto(120).min(2),
    cpf: opcional(z.string().refine(cpfValido, 'CPF inválido.')),
    nascimento: opcional(
      z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato AAAA-MM-DD.')
        .refine(
          (d) => !Number.isNaN(Date.parse(d)) && new Date(d) <= new Date(),
          'Data de nascimento inválida.',
        ),
    ),
    sexo: opcional(z.enum(['F', 'M', 'O'])),
    celular: opcional(celular),
    email: opcional(z.string().email().max(254)),
    endereco: opcional(
      z
        .object({
          cep: texto(9).optional(),
          logradouro: texto(120).optional(),
          numero: texto(15).optional(),
          complemento: texto(60).optional(),
          bairro: texto(80).optional(),
          cidade: texto(80).optional(),
          uf: texto(2).optional(),
        })
        .strict(),
    ),
    responsavel_nome: opcional(texto(120).min(2)),
    responsavel_parentesco: opcional(texto(40)),
    responsavel_celular: opcional(celular),
    origem: opcional(texto(60)),
    observacoes: opcional(texto(2000)),
  })
  .strict();

// A listagem por GET não aceita termo de busca: um CPF na query string acabaria em logs de
// acesso/proxy (seção 3.2). A busca vai no corpo de POST /pacientes/buscar.
const listaSchema = z
  .object({
    ativo: z.enum(['true', 'false', 'todos']).default('true'),
    pagina: z.coerce.number().int().min(1).default(1),
    limite: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

const buscaSchema = z
  .object({
    busca: z.string().trim().min(1).max(100),
    ativo: z.enum(['true', 'false', 'todos']).default('true'),
    pagina: z.number().int().min(1).default(1),
    limite: z.number().int().min(1).max(100).default(20),
  })
  .strict();

const idSchema = z.string().uuid();

function validar(schema, dados, res) {
  const r = schema.safeParse(dados);
  if (!r.success) {
    const i = r.error.issues[0];
    res.status(400).json({ erro: `${i.path.length ? `${i.path.join('.')}: ` : ''}${i.message}` });
    return null;
  }
  return r.data;
}

function idValido(req, res) {
  if (idSchema.safeParse(req.params.id).success) return true;
  res.status(404).json({ erro: 'Paciente não encontrado.' });
  return false;
}

/**
 * @swagger
 * tags:
 *   name: Pacientes
 *   description: Cadastro de pacientes (CPF cifrado; CPF e celular mascarados nas respostas)
 * /pacientes:
 *   get:
 *     summary: Lista pacientes (sem termo de busca — use POST /pacientes/buscar)
 *     tags: [Pacientes]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: query, name: ativo, schema: { type: string, enum: ['true', 'false', todos], default: 'true' } }
 *       - { in: query, name: pagina, schema: { type: integer, default: 1 } }
 *       - { in: query, name: limite, schema: { type: integer, default: 20, maximum: 100 } }
 *     responses:
 *       200: { description: Página de pacientes (CPF/celular mascarados) }
 *       401: { description: Não autenticado }
 *       403: { description: Perfil ou unidade sem permissão }
 *   post:
 *     summary: Cadastra paciente (gera o nº de prontuário)
 *     tags: [Pacientes]
 *     security: [{ cookieAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nome]
 *             properties:
 *               nome: { type: string }
 *               cpf: { type: string, description: 'RN-001 — válido e único; sem CPF exige responsavel_nome' }
 *               nascimento: { type: string, format: date }
 *               sexo: { type: string, enum: [F, M, O] }
 *               celular: { type: string }
 *               email: { type: string, format: email }
 *               endereco: { type: object }
 *               responsavel_nome: { type: string }
 *               responsavel_parentesco: { type: string }
 *               responsavel_celular: { type: string }
 *               origem: { type: string }
 *               observacoes: { type: string }
 *     responses:
 *       201: { description: Paciente criado }
 *       400: { description: Dados inválidos, CPF inválido ou sem CPF e sem responsável }
 *       403: { description: Somente Secretaria cadastra }
 *       409: { description: CPF já cadastrado }
 */
router.get('/', LER, async (req, res, next) => {
  try {
    if ('busca' in req.query) {
      return res
        .status(400)
        .json({ erro: 'Use POST /pacientes/buscar: o termo não pode ir na URL.' });
    }
    const filtros = validar(listaSchema, req.query, res);
    if (!filtros) return undefined;
    return res.json(await service.listar(filtros));
  } catch (err) {
    return next(err);
  }
});

/**
 * @swagger
 * /pacientes/buscar:
 *   post:
 *     summary: Busca pacientes por nome, CPF completo ou parte do celular (termo no corpo, nunca na URL)
 *     tags: [Pacientes]
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       200: { description: Página de pacientes (CPF/celular mascarados) }
 *       400: { description: Termo ausente ou inválido }
 *       403: { description: Perfil ou unidade sem permissão }
 */
router.post('/buscar', LER, async (req, res, next) => {
  try {
    const filtros = validar(buscaSchema, req.body, res);
    if (!filtros) return undefined;
    return res.json(await service.listar(filtros));
  } catch (err) {
    return next(err);
  }
});

router.post('/', ESCREVER, async (req, res, next) => {
  try {
    const dados = validar(pacienteSchema, req.body, res);
    if (!dados) return undefined;
    const criado = await service.criar(dados);
    res.locals.auditoria = {
      entidade: 'pacientes',
      entidadeId: criado.id,
      acao: 'criar',
      depois: service.paraAuditoria(criado),
    };
    return res.status(201).json(service.serializar(criado, { completo: true }));
  } catch (err) {
    return next(err);
  }
});

/**
 * @swagger
 * /pacientes/exportar:
 *   get:
 *     summary: Exporta os pacientes em planilha (CPF e celular mascarados)
 *     tags: [Pacientes]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: query, name: formato, required: true, schema: { type: string, enum: [xlsx] } }
 *     responses:
 *       200: { description: Arquivo .xlsx }
 *       400: { description: Formato não suportado }
 *       403: { description: Somente Secretaria exporta }
 */
router.get('/exportar', ESCREVER, async (req, res, next) => {
  try {
    if (req.query.formato !== 'xlsx')
      return res.status(400).json({ erro: 'Formato não suportado. Use xlsx.' });
    const pacientes = await service.paraExportacao();
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Pacientes');
    ws.columns = [
      { header: 'Prontuário', key: 'numero_prontuario', width: 12 },
      { header: 'Nome', key: 'nome', width: 36 },
      { header: 'CPF', key: 'cpf', width: 18 },
      { header: 'Nascimento', key: 'nascimento', width: 14 },
      { header: 'Celular', key: 'celular', width: 20 },
      { header: 'E-mail', key: 'email', width: 32 },
      { header: 'Origem', key: 'origem', width: 18 },
      { header: 'Ativo', key: 'ativo', width: 8 },
    ];
    pacientes.forEach((p) => ws.addRow({ ...p, ativo: p.ativo ? 'Sim' : 'Não' }));
    const buffer = await wb.xlsx.writeBuffer();
    res.locals.auditoria = {
      entidade: 'pacientes',
      acao: 'exportar',
      depois: { formato: 'xlsx', total: pacientes.length },
    };
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="pacientes.xlsx"',
    });
    return res.send(Buffer.from(buffer));
  } catch (err) {
    return next(err);
  }
});

/**
 * @swagger
 * /pacientes/{id}:
 *   get:
 *     summary: Ficha completa do paciente (CPF/celular mascarados; inclui endereço, observações e consentimentos)
 *     tags: [Pacientes]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Ficha }
 *       404: { description: Não encontrado }
 *   patch:
 *     summary: Edita o cadastro (mesmos campos do POST, todos opcionais)
 *     tags: [Pacientes]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Paciente atualizado }
 *       400: { description: Dados inválidos ou ficaria sem CPF e sem responsável }
 *       404: { description: Não encontrado }
 *       409: { description: CPF já cadastrado }
 *   delete:
 *     summary: Remove o paciente — inativa se houver histórico, exclui se não houver (RN-009)
 *     tags: [Pacientes]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: "{ acao: inativado | excluido }" }
 *       404: { description: Não encontrado }
 */
router.get('/:id', LER, async (req, res, next) => {
  try {
    if (!idValido(req, res)) return undefined;
    return res.json(await service.fichaCompleta(req.params.id));
  } catch (err) {
    return next(err);
  }
});

router.patch('/:id', ESCREVER, async (req, res, next) => {
  try {
    if (!idValido(req, res)) return undefined;
    const dados = validar(pacienteSchema.partial(), req.body, res);
    if (!dados) return undefined;
    const { antes, depois } = await service.atualizar(req.params.id, dados);
    res.locals.auditoria = {
      entidade: 'pacientes',
      entidadeId: depois.id,
      acao: 'editar',
      antes: service.paraAuditoria(antes),
      depois: service.paraAuditoria(depois),
    };
    return res.json(service.serializar(depois, { completo: true }));
  } catch (err) {
    return next(err);
  }
});

router.delete('/:id', ESCREVER, async (req, res, next) => {
  try {
    if (!idValido(req, res)) return undefined;
    const { acao, antes, depois } = await service.removerOuInativar(req.params.id);
    res.locals.auditoria = {
      entidade: 'pacientes',
      entidadeId: req.params.id,
      acao: acao === 'excluido' ? 'excluir' : 'inativar',
      antes: service.paraAuditoria(antes),
      depois: depois ? service.paraAuditoria(depois) : null,
    };
    return res.json({ acao });
  } catch (err) {
    return next(err);
  }
});

/**
 * @swagger
 * /pacientes/{id}/resumo:
 *   get:
 *     summary: Próximas consultas e OS em aberto (OS entram no M3)
 *     tags: [Pacientes]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Resumo }
 *       404: { description: Não encontrado }
 * /pacientes/{id}/revelar/{campo}:
 *   get:
 *     summary: Revela um campo mascarado (cpf, celular, responsavel_celular) — fica na auditoria
 *     tags: [Pacientes]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *       - { in: path, name: campo, required: true, schema: { type: string, enum: [cpf, celular, responsavel_celular] } }
 *     responses:
 *       200: { description: Valor completo }
 *       400: { description: Campo não revelável }
 *       404: { description: Não encontrado }
 * /pacientes/{id}/consentimento:
 *   post:
 *     summary: Registra consentimento LGPD
 *     tags: [Pacientes]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [finalidade, forma]
 *             properties:
 *               finalidade: { type: string }
 *               forma: { type: string, enum: [presencial, digital, termo_assinado] }
 *     responses:
 *       201: { description: Consentimento registrado }
 *       400: { description: Dados inválidos }
 *       404: { description: Não encontrado }
 */
router.get('/:id/resumo', LER, async (req, res, next) => {
  try {
    if (!idValido(req, res)) return undefined;
    return res.json(await service.resumo(req.params.id));
  } catch (err) {
    return next(err);
  }
});

router.get('/:id/revelar/:campo', LER, async (req, res, next) => {
  try {
    if (!idValido(req, res)) return undefined;
    const valor = await service.revelar(req.params.id, req.params.campo);
    res.locals.auditoria = {
      entidade: 'pacientes',
      entidadeId: req.params.id,
      acao: `revelar_${req.params.campo}`,
    };
    return res.json({ campo: req.params.campo, valor });
  } catch (err) {
    return next(err);
  }
});

router.post('/:id/consentimento', ESCREVER, async (req, res, next) => {
  try {
    if (!idValido(req, res)) return undefined;
    const dados = validar(
      z
        .object({
          finalidade: texto(200).min(3),
          forma: z.enum(['presencial', 'digital', 'termo_assinado']),
        })
        .strict(),
      req.body,
      res,
    );
    if (!dados) return undefined;
    const c = await service.registrarConsentimento(req.params.id, req.usuario.id, dados);
    res.locals.auditoria = {
      entidade: 'pacientes',
      entidadeId: req.params.id,
      acao: 'consentimento',
      depois: c,
    };
    return res.status(201).json(c);
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
