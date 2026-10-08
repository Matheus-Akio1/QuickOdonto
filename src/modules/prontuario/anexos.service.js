const { query } = require('../../config/db');
const arquivo = require('../../lib/arquivoCifrado');
const { erro, buscarPaciente } = require('./prontuario.service');

const COLUNAS = `a.id, a.paciente_id, a.tipo, a.nome, a.mime, a.tamanho, a.criado_em, u.nome AS enviado_por`;

async function listar(pacienteId) {
  await buscarPaciente(pacienteId);
  const { rows } = await query(
    `SELECT ${COLUNAS} FROM anexos a LEFT JOIN usuarios u ON u.id = a.usuario_id
      WHERE a.paciente_id = $1 ORDER BY a.criado_em DESC`,
    [pacienteId],
  );
  return rows;
}

async function buscar(id) {
  const { rows } = await query(
    `SELECT ${COLUNAS}, a.caminho FROM anexos a LEFT JOIN usuarios u ON u.id = a.usuario_id WHERE a.id = $1`,
    [id],
  );
  if (!rows[0]) throw erro(404, 'Anexo não encontrado.');
  return rows[0];
}

/** Valida o conteúdo real, cifra e grava fora do diretório público; o banco guarda só metadados. */
async function enviar(pacienteId, usuarioId, { tipo, file }) {
  await buscarPaciente(pacienteId);
  if (!file || !file.buffer?.length) throw erro(400, 'Envie um arquivo.');
  const mimeReal = arquivo.detectarMime(file.buffer);
  if (!mimeReal) throw erro(415, 'Tipo de arquivo não aceito. Envie JPG, PNG, WEBP ou PDF.');
  if (file.mimetype && file.mimetype !== mimeReal) {
    throw erro(415, 'O conteúdo do arquivo não corresponde ao tipo informado.');
  }
  const caminho = await arquivo.gravar(file.buffer);
  const { rows } = await query(
    `INSERT INTO anexos (paciente_id, tipo, nome, mime, tamanho, caminho, usuario_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [
      pacienteId,
      tipo,
      arquivo.sanitizarNome(file.originalname),
      mimeReal,
      file.size,
      caminho,
      usuarioId,
    ],
  );
  const { caminho: _caminho, ...meta } = await buscar(rows[0].id);
  return meta;
}

async function conteudo(id) {
  const a = await buscar(id);
  return { meta: a, dados: await arquivo.ler(a.caminho) };
}

module.exports = { listar, buscar, enviar, conteudo };
