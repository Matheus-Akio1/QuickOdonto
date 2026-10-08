const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { query } = require('../../config/db');
const { enviarLinkSenha } = require('../auth/auth.service');

const PERFIS_POR_UNIDADE = {
  clinica: ['secretaria', 'clinica', 'adm_clinica'],
  laboratorio: ['laboratorio', 'adm_laboratorio'],
};

const COLUNAS = 'id, nome, email, perfil, unidade, status, ultimo_acesso, criado_em';

function erro(status, mensagem) {
  return Object.assign(new Error(mensagem), { status });
}

/** RN-014 — o administrador só enxerga e altera usuários da própria unidade. */
async function buscar(id, unidade) {
  const { rows } = await query(`SELECT ${COLUNAS} FROM usuarios WHERE id = $1 AND unidade = $2`, [
    id,
    unidade,
  ]);
  if (!rows[0]) throw erro(404, 'Usuário não encontrado.');
  return rows[0];
}

async function listar(unidade, { busca, status, pagina, limite }) {
  const filtros = ['unidade = $1'];
  const valores = [unidade];
  if (busca) {
    valores.push(`%${busca}%`);
    filtros.push(`(nome ILIKE $${valores.length} OR email ILIKE $${valores.length})`);
  }
  if (status) {
    valores.push(status);
    filtros.push(`status = $${valores.length}`);
  }
  const where = filtros.join(' AND ');
  const total = await query(`SELECT count(*)::int AS n FROM usuarios WHERE ${where}`, valores);
  const { rows } = await query(
    `SELECT ${COLUNAS} FROM usuarios WHERE ${where} ORDER BY nome
      LIMIT $${valores.length + 1} OFFSET $${valores.length + 2}`,
    [...valores, limite, (pagina - 1) * limite],
  );
  return { itens: rows, pagina, limite, total: total.rows[0].n };
}

async function criar(unidade, { nome, email, perfil }) {
  if (!PERFIS_POR_UNIDADE[unidade].includes(perfil))
    throw erro(400, 'Perfil inválido para a sua unidade.');

  // Senha inutilizável até o convidado definir a sua pelo link do convite.
  const senha_hash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
  let usuario;
  try {
    const { rows } = await query(
      `INSERT INTO usuarios (nome, email, senha_hash, perfil, unidade, status)
       VALUES ($1,$2,$3,$4,$5,'convidado') RETURNING ${COLUNAS}`,
      [nome, email.toLowerCase(), senha_hash, perfil, unidade],
    );
    usuario = rows[0];
  } catch (err) {
    if (err.code === '23505') throw erro(409, 'Já existe um usuário com este e-mail.');
    throw err;
  }
  await enviarLinkSenha(usuario, 'convite');
  return usuario;
}

async function atualizar(unidade, id, solicitanteId, dados) {
  const antes = await buscar(id, unidade);
  if (dados.perfil) {
    if (!PERFIS_POR_UNIDADE[unidade].includes(dados.perfil))
      throw erro(400, 'Perfil inválido para a sua unidade.');
    if (id === solicitanteId && dados.perfil !== antes.perfil) {
      throw erro(400, 'Você não pode alterar o seu próprio perfil.');
    }
  }
  const novo = { ...antes, ...dados, email: (dados.email || antes.email).toLowerCase() };
  try {
    const { rows } = await query(
      `UPDATE usuarios SET nome = $2, email = $3, perfil = $4, atualizado_em = now()
        WHERE id = $1 RETURNING ${COLUNAS}`,
      [id, novo.nome, novo.email, novo.perfil],
    );
    return { antes, depois: rows[0] };
  } catch (err) {
    if (err.code === '23505') throw erro(409, 'Já existe um usuário com este e-mail.');
    throw err;
  }
}

async function bloquear(unidade, id, solicitanteId) {
  if (id === solicitanteId) throw erro(400, 'Você não pode bloquear o seu próprio usuário.');
  const antes = await buscar(id, unidade);
  const { rows } = await query(
    `UPDATE usuarios SET status = 'bloqueado', atualizado_em = now() WHERE id = $1 RETURNING ${COLUNAS}`,
    [id],
  );
  await query(
    'UPDATE sessoes SET revogada_em = now() WHERE usuario_id = $1 AND revogada_em IS NULL',
    [id],
  );
  return { antes, depois: rows[0] };
}

async function desbloquear(unidade, id) {
  const antes = await buscar(id, unidade);
  if (antes.status !== 'bloqueado') throw erro(400, 'O usuário não está bloqueado.');
  const { rows } = await query(
    `UPDATE usuarios SET status = 'ativo', tentativas_falhas = 0, bloqueado_ate = NULL, atualizado_em = now()
      WHERE id = $1 RETURNING ${COLUNAS}`,
    [id],
  );
  return { antes, depois: rows[0] };
}

async function dispararRedefinicao(unidade, id) {
  const usuario = await buscar(id, unidade);
  if (usuario.status === 'bloqueado')
    throw erro(400, 'Desbloqueie o usuário antes de redefinir a senha.');
  await enviarLinkSenha(usuario, usuario.status === 'convidado' ? 'convite' : 'redefinicao');
}

module.exports = {
  PERFIS_POR_UNIDADE,
  buscar,
  listar,
  criar,
  atualizar,
  bloquear,
  desbloquear,
  dispararRedefinicao,
};
