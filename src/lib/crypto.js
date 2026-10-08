const crypto = require('crypto');

/**
 * Criptografia de campo (seção 3.1): AES-256-GCM com IV aleatório por valor.
 * Formato guardado: "v1:<iv>:<tag>:<cifrado>" (base64url) — o prefixo de versão
 * permite rotacionar a chave sem ambiguidade.
 */
const VERSAO = 'v1';

function chave(nome) {
  const b64 = process.env[nome];
  const buf = b64 ? Buffer.from(b64, 'base64') : null;
  if (!buf || buf.length !== 32) {
    throw new Error(`${nome} ausente ou inválida (esperado 32 bytes em base64).`);
  }
  return buf;
}

function cifrar(texto) {
  if (texto === null || texto === undefined) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', chave('ENC_KEY'), iv);
  const dados = Buffer.concat([cipher.update(String(texto), 'utf8'), cipher.final()]);
  return [VERSAO, iv, cipher.getAuthTag(), dados]
    .map((p, i) => (i ? p.toString('base64url') : p))
    .join(':');
}

function decifrar(valor) {
  if (valor === null || valor === undefined) return null;
  const [versao, iv, tag, dados] = String(valor).split(':');
  if (versao !== VERSAO || !iv || !tag || !dados)
    throw new Error('Formato de campo cifrado inválido.');
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    chave('ENC_KEY'),
    Buffer.from(iv, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(dados, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

/** Hash determinístico (HMAC-SHA256, chave própria) para busca e unicidade de campo cifrado. */
function hashBusca(texto) {
  if (texto === null || texto === undefined) return null;
  return crypto.createHmac('sha256', chave('HMAC_KEY')).update(String(texto)).digest('hex');
}

module.exports = { cifrar, decifrar, hashBusca };
