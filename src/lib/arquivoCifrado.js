const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');

/**
 * Arquivos clínicos (seção 3.1): cifrados com AES-256-GCM antes de tocar o disco e guardados
 * fora de qualquer diretório público. Formato no disco: "QOA1" | iv(12) | tag(16) | cifrado.
 */
const MAGICO = Buffer.from('QOA1');
const TAMANHO_MAXIMO = 50 * 1024 * 1024;

const diretorio = () => process.env.STORAGE_DIR || path.join(process.cwd(), 'storage', 'anexos');

function chave() {
  const buf = Buffer.from(process.env.ENC_KEY || '', 'base64');
  if (buf.length !== 32)
    throw new Error('ENC_KEY ausente ou inválida (esperado 32 bytes em base64).');
  return buf;
}

/** Tipos aceitos, conferidos pela assinatura binária — o mime declarado pelo navegador não basta. */
const ASSINATURAS = {
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': (b) =>
    b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/webp': (b) =>
    b.subarray(0, 4).toString('latin1') === 'RIFF' &&
    b.subarray(8, 12).toString('latin1') === 'WEBP',
  'application/pdf': (b) => b.subarray(0, 5).toString('latin1') === '%PDF-',
};
const MIMES = Object.keys(ASSINATURAS);

/** Detecta o tipo real pelo conteúdo; null se não for um tipo aceito. */
function detectarMime(buffer) {
  return MIMES.find((m) => ASSINATURAS[m](buffer)) ?? null;
}

/** Nome exibível seguro: sem caminho, sem caracteres de controle, tamanho limitado. */
function sanitizarNome(nome) {
  const base = path.basename(String(nome || 'arquivo')).normalize('NFC');
  const limpo = [...base]
    .map((ch) =>
      ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127 || '<>:"/\\|?*'.includes(ch) ? '_' : ch,
    )
    .join('')
    .replace(/^\.+/, '')
    .trim()
    .slice(0, 120);
  return limpo || 'arquivo';
}

async function gravar(buffer) {
  const nomeDisco = `${crypto.randomUUID()}.enc`;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', chave(), iv);
  const cifrado = Buffer.concat([cipher.update(buffer), cipher.final()]);
  await fs.mkdir(diretorio(), { recursive: true, mode: 0o700 });
  await fs.writeFile(
    path.join(diretorio(), nomeDisco),
    Buffer.concat([MAGICO, iv, cipher.getAuthTag(), cifrado]),
    {
      mode: 0o600,
      flag: 'wx',
    },
  );
  return nomeDisco;
}

async function ler(nomeDisco) {
  if (!/^[0-9a-f-]{36}\.enc$/.test(nomeDisco)) throw new Error('Caminho de anexo inválido.');
  const dados = await fs.readFile(path.join(diretorio(), nomeDisco));
  if (!dados.subarray(0, 4).equals(MAGICO))
    throw new Error('Arquivo de anexo em formato desconhecido.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', chave(), dados.subarray(4, 16));
  decipher.setAuthTag(dados.subarray(16, 32));
  return Buffer.concat([decipher.update(dados.subarray(32)), decipher.final()]);
}

module.exports = { TAMANHO_MAXIMO, MIMES, detectarMime, sanitizarNome, gravar, ler, diretorio };
