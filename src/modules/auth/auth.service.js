const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../../config/db');
const cfg = require('../../config/auth');
const { enviarEmail } = require('../../lib/mailer');

const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');
// Hash falso para igualar o tempo de resposta quando o e-mail não existe.
const HASH_FALSO = bcrypt.hashSync('nao-existe', 10);

function erro(status, mensagem) {
  return Object.assign(new Error(mensagem), { status });
}

function gerarAccessToken(usuario) {
  return jwt.sign({ perfil: usuario.perfil, unidade: usuario.unidade }, cfg.jwtSecret(), {
    subject: usuario.id,
    expiresIn: process.env.JWT_EXPIRES || '15m',
    algorithm: 'HS256',
  });
}

async function criarSessao(usuarioId, { ip, userAgent }) {
  const refresh = crypto.randomBytes(48).toString('base64url');
  await query(
    `INSERT INTO sessoes (usuario_id, refresh_hash, user_agent, ip, expira_em)
     VALUES ($1, $2, $3, $4, now() + ($5 || ' days')::interval)`,
    [usuarioId, sha256(refresh), userAgent || null, ip || null, String(cfg.REFRESH_DIAS)],
  );
  return refresh;
}

async function login(email, senha, ctx) {
  const { rows } = await query(
    `SELECT id, nome, email, senha_hash, perfil, unidade, status, tentativas_falhas, bloqueado_ate
       FROM usuarios WHERE email = $1`,
    [email.toLowerCase()],
  );
  const usuario = rows[0];
  const genericas = erro(401, 'E-mail ou senha inválidos.');

  if (!usuario) {
    await bcrypt.compare(senha, HASH_FALSO);
    throw genericas;
  }
  if (usuario.status !== 'ativo') throw genericas;
  if (usuario.bloqueado_ate && new Date(usuario.bloqueado_ate) > new Date()) {
    throw erro(423, 'Conta temporariamente bloqueada por tentativas inválidas. Tente mais tarde.');
  }

  const ok = await bcrypt.compare(senha, usuario.senha_hash);
  if (!ok) {
    await query(
      `UPDATE usuarios SET
         tentativas_falhas = tentativas_falhas + 1,
         bloqueado_ate = CASE WHEN tentativas_falhas + 1 >= $2
                         THEN now() + ($3 || ' minutes')::interval ELSE bloqueado_ate END,
         atualizado_em = now()
       WHERE id = $1`,
      [usuario.id, cfg.MAX_TENTATIVAS, String(cfg.BLOQUEIO_MINUTOS)],
    );
    throw genericas;
  }

  await query(
    `UPDATE usuarios SET tentativas_falhas = 0, bloqueado_ate = NULL,
       ultimo_acesso = now(), atualizado_em = now() WHERE id = $1`,
    [usuario.id],
  );

  const refresh = await criarSessao(usuario.id, ctx);
  return { usuario, access: gerarAccessToken(usuario), refresh };
}

/** Refresh rotativo: o token usado é revogado e um novo é emitido. */
async function renovar(refreshRecebido, ctx) {
  if (!refreshRecebido) throw erro(401, 'Sessão inválida ou expirada.');
  const hash = sha256(refreshRecebido);

  const { rows } = await query(
    `SELECT s.id, s.usuario_id, s.ultimo_uso, s.expira_em, s.revogada_em,
            u.id AS uid, u.perfil, u.unidade, u.status
       FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id
      WHERE s.refresh_hash = $1`,
    [hash],
  );
  const s = rows[0];
  if (!s) throw erro(401, 'Sessão inválida ou expirada.');

  if (s.revogada_em) {
    // Reuso de token já rotacionado: possível roubo — derruba todas as sessões do usuário.
    await query(
      'UPDATE sessoes SET revogada_em = now() WHERE usuario_id = $1 AND revogada_em IS NULL',
      [s.usuario_id],
    );
    throw erro(401, 'Sessão inválida ou expirada.');
  }

  const inativo = Date.now() - new Date(s.ultimo_uso).getTime() > cfg.INATIVIDADE_MINUTOS * 60000;
  if (inativo || new Date(s.expira_em) < new Date() || s.status !== 'ativo') {
    await query('UPDATE sessoes SET revogada_em = now() WHERE id = $1', [s.id]);
    throw erro(401, 'Sessão inválida ou expirada.');
  }

  await query('UPDATE sessoes SET revogada_em = now() WHERE id = $1', [s.id]);
  const refresh = await criarSessao(s.usuario_id, ctx);
  const access = gerarAccessToken({ id: s.usuario_id, perfil: s.perfil, unidade: s.unidade });
  return { access, refresh };
}

async function logout(refreshRecebido) {
  if (!refreshRecebido) return;
  await query(
    'UPDATE sessoes SET revogada_em = now() WHERE refresh_hash = $1 AND revogada_em IS NULL',
    [sha256(refreshRecebido)],
  );
}

async function permissoesDoPerfil(perfil) {
  const { rows } = await query(
    'SELECT chave, habilitado FROM perfis_permissoes WHERE perfil = $1',
    [perfil],
  );
  return Object.fromEntries(rows.map((r) => [r.chave, r.habilitado]));
}

const TOKEN_VALIDADE_MIN = { redefinicao: 30, convite: 60 * 24 * 3 };

/** Gera token de uso único (só o hash fica no banco) e invalida os anteriores do mesmo tipo. */
async function criarTokenSenha(usuarioId, tipo) {
  const token = crypto.randomBytes(32).toString('base64url');
  await query(
    'UPDATE tokens_senha SET usado_em = now() WHERE usuario_id = $1 AND tipo = $2 AND usado_em IS NULL',
    [usuarioId, tipo],
  );
  await query(
    `INSERT INTO tokens_senha (usuario_id, token_hash, tipo, expira_em)
     VALUES ($1, $2, $3, now() + ($4 || ' minutes')::interval)`,
    [usuarioId, sha256(token), tipo, String(TOKEN_VALIDADE_MIN[tipo])],
  );
  return token;
}

async function enviarLinkSenha(usuario, tipo) {
  const token = await criarTokenSenha(usuario.id, tipo);
  const link = `${process.env.APP_URL}/redefinir-senha/${token}`;
  const convite = tipo === 'convite';
  await enviarEmail({
    para: usuario.email,
    assunto: convite ? 'Convite para o QuickOdonto' : 'Redefinição de senha — QuickOdonto',
    texto: `Olá, ${usuario.nome}.\n\n${
      convite
        ? 'Você foi convidado(a) para o QuickOdonto. Defina sua senha'
        : 'Para redefinir sua senha'
    } pelo link (uso único, validade limitada):\n${link}\n\nSe você não esperava este e-mail, ignore-o.`,
  });
}

/** Resposta sempre igual: não revela se o e-mail existe. */
async function solicitarRedefinicao(email) {
  const { rows } = await query(
    "SELECT id, nome, email FROM usuarios WHERE email = $1 AND status = 'ativo'",
    [email.toLowerCase()],
  );
  if (rows[0]) await enviarLinkSenha(rows[0], 'redefinicao');
}

async function redefinirSenha(token, novaSenha) {
  const { rows } = await query(
    `SELECT t.id, t.usuario_id, t.tipo FROM tokens_senha t
      WHERE t.token_hash = $1 AND t.usado_em IS NULL AND t.expira_em > now()`,
    [sha256(token)],
  );
  const t = rows[0];
  if (!t) throw erro(400, 'Link inválido ou expirado.');

  const senha_hash = await bcrypt.hash(novaSenha, 10);
  await query('UPDATE tokens_senha SET usado_em = now() WHERE id = $1', [t.id]);
  await query(
    `UPDATE usuarios SET senha_hash = $2, tentativas_falhas = 0, bloqueado_ate = NULL,
       status = CASE WHEN status = 'convidado' THEN 'ativo' ELSE status END, atualizado_em = now()
      WHERE id = $1`,
    [t.usuario_id, senha_hash],
  );
  // Troca de senha derruba todas as sessões abertas.
  await query(
    'UPDATE sessoes SET revogada_em = now() WHERE usuario_id = $1 AND revogada_em IS NULL',
    [t.usuario_id],
  );
}

module.exports = {
  login,
  renovar,
  logout,
  permissoesDoPerfil,
  enviarLinkSenha,
  solicitarRedefinicao,
  redefinirSenha,
};
