const express = require('express');
const multer = require('multer');
const { z } = require('zod');
const { validar, uuidOu404 } = require('../../lib/http');
const { TAMANHO_MAXIMO } = require('../../lib/arquivoCifrado');
const links = require('../../lib/links');
const { BASE, CLINICA, acesso } = require('./prontuario.routes');
const prontuario = require('./prontuario.service');
const service = require('./anexos.service');
const { gerarPdfProntuario } = require('./pdf');
const { query } = require('../../config/db');

const TIPOS = ['radiografia', 'foto', 'documento', 'escaneamento', 'outro'];

// Arquivo fica só em memória até ser validado e cifrado; nunca toca o disco em claro.
const upload = multer({
  storage: multer.memoryStorage(),
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

/* ---------------------------- /pacientes/:id/anexos ---------------------------- */

const pacientes = express.Router();
pacientes.use(BASE);

/**
 * @swagger
 * /pacientes/{id}/anexos:
 *   get:
 *     summary: Anexos do paciente — só metadados (acesso registrado)
 *     tags: [Prontuário]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Lista de anexos }
 *   post:
 *     summary: Envia anexo (JPG, PNG, WEBP ou PDF até 50 MB) — conteúdo conferido e cifrado no servidor
 *     tags: [Prontuário]
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
 *               tipo: { type: string, enum: [radiografia, foto, documento, escaneamento, outro] }
 *     responses:
 *       201: { description: Anexo gravado }
 *       400: { description: Envio inválido }
 *       413: { description: Acima de 50 MB }
 *       415: { description: Tipo não aceito ou conteúdo diferente do declarado }
 */
pacientes.get('/:id/anexos', CLINICA, async (req, res, next) => {
  try {
    if (!uuidOu404(req.params.id, res, 'Paciente não encontrado.')) return undefined;
    await prontuario.buscarPaciente(req.params.id);
    await acesso(req, req.params.id, 'anexos');
    return res.json(await service.listar(req.params.id));
  } catch (err) {
    return next(err);
  }
});

pacientes.post('/:id/anexos', CLINICA, receberArquivo, async (req, res, next) => {
  try {
    if (!uuidOu404(req.params.id, res, 'Paciente não encontrado.')) return undefined;
    const d = validar(z.object({ tipo: z.enum(TIPOS) }).strict(), req.body, res);
    if (!d) return undefined;
    const anexo = await service.enviar(req.params.id, req.usuario.id, {
      tipo: d.tipo,
      file: req.file,
    });
    res.locals.auditoria = {
      entidade: 'anexos',
      entidadeId: anexo.id,
      acao: 'criar',
      depois: {
        paciente_id: req.params.id,
        tipo: anexo.tipo,
        mime: anexo.mime,
        tamanho: anexo.tamanho,
      },
    };
    return res.status(201).json(anexo);
  } catch (err) {
    return next(err);
  }
});

/* --------------------------------- /anexos/:id --------------------------------- */

const anexos = express.Router();
anexos.use(BASE, CLINICA);

/**
 * @swagger
 * /anexos/{id}:
 *   get:
 *     summary: Metadados do anexo + link de uso único (60 s) para visualizar/baixar
 *     tags: [Prontuário]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: "Metadados e { url, expira_em }" }
 *       404: { description: Não encontrado }
 */
anexos.get('/:id', async (req, res, next) => {
  try {
    if (!uuidOu404(req.params.id, res, 'Anexo não encontrado.')) return undefined;
    const { caminho: _caminho, ...meta } = await service.buscar(req.params.id);
    await acesso(req, meta.paciente_id, 'anexo_link');
    const link = await links.emitir({
      tipo: 'anexo',
      referenciaId: meta.id,
      usuarioId: req.usuario.id,
    });
    return res.json({ ...meta, ...link });
  } catch (err) {
    return next(err);
  }
});

/* ------------------------------- /arquivos/:token ------------------------------- */

const arquivos = express.Router();

/**
 * @swagger
 * /arquivos/{token}:
 *   get:
 *     summary: Resgata um link de uso único (anexo ou PDF do prontuário). O token é a credencial.
 *     tags: [Prontuário]
 *     parameters:
 *       - { in: path, name: token, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: Arquivo decifrado (não armazenável em cache) }
 *       404: { description: Link inválido, expirado ou já usado }
 */
arquivos.get('/:token', async (req, res, next) => {
  try {
    const link = await links.consumir(req.params.token);
    if (!link) return res.status(404).json({ erro: 'Link inválido, expirado ou já utilizado.' });

    let dados;
    let mime;
    let nome;
    let pacienteId;
    if (link.tipo === 'anexo') {
      const r = await service.conteudo(link.referencia_id);
      ({ dados } = r);
      ({ mime, nome, paciente_id: pacienteId } = r.meta);
    } else {
      const { rows } = await query('SELECT nome FROM usuarios WHERE id = $1', [link.usuario_id]);
      pacienteId = link.referencia_id;
      dados = await gerarPdfProntuario(pacienteId, rows[0]?.nome ?? 'usuário');
      mime = 'application/pdf';
      nome = 'prontuario.pdf';
    }
    await prontuario.registrarAcesso({
      pacienteId,
      usuarioId: link.usuario_id,
      recurso: link.tipo === 'anexo' ? 'anexo_download' : 'pdf',
      ip: req.ip,
    });

    res.set({
      'Content-Type': mime,
      'Content-Length': dados.length,
      'Content-Disposition': `${link.tipo === 'anexo' ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(nome)}`,
      'Cache-Control': 'no-store, private',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy':
        "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    });
    return res.send(dados);
  } catch (err) {
    return next(err);
  }
});

module.exports = { pacientes, anexos, arquivos };
