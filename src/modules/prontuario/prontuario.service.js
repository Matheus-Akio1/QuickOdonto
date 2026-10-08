const { pool, query } = require('../../config/db');
const { cifrar, decifrar } = require('../../lib/crypto');

function erro(status, mensagem) {
  return Object.assign(new Error(mensagem), { status });
}

async function comTransacao(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await fn(client);
    await client.query('COMMIT');
    return r;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

const decifrarJson = (v) => (v ? JSON.parse(decifrar(v)) : null);
const resumir = (texto, n = 140) => (texto.length > n ? `${texto.slice(0, n - 1)}…` : texto);

/* ------------------------------ Base / acesso ------------------------------ */

/** Quem escreve no prontuário precisa ser um profissional cadastrado e ativo. */
async function profissionalDoUsuario(usuarioId) {
  const { rows } = await query('SELECT id FROM profissionais WHERE usuario_id = $1 AND ativo', [
    usuarioId,
  ]);
  if (!rows[0]) throw erro(403, 'Seu usuário não está cadastrado como profissional ativo.');
  return rows[0].id;
}

async function buscarPaciente(id) {
  const { rows } = await query(
    `SELECT id, nome, numero_prontuario, nascimento::text AS nascimento, sexo, ativo
       FROM pacientes WHERE id = $1`,
    [id],
  );
  if (!rows[0]) throw erro(404, 'Paciente não encontrado.');
  return rows[0];
}

/**
 * RF-CLI-015 — toda leitura de conteúdo clínico é registrada ANTES de responder.
 * Se o registro falhar, a leitura também falha: nenhum dado sai sem trilha.
 */
async function registrarAcesso({ pacienteId, usuarioId, recurso, ip }) {
  await query(
    'INSERT INTO acessos_prontuario (paciente_id, usuario_id, recurso, ip) VALUES ($1,$2,$3,$4)',
    [pacienteId, usuarioId, recurso, ip || null],
  );
}

async function listarAcessos(pacienteId, { pagina, limite }) {
  await buscarPaciente(pacienteId);
  const total = await query(
    'SELECT count(*)::int AS n FROM acessos_prontuario WHERE paciente_id = $1',
    [pacienteId],
  );
  const { rows } = await query(
    `SELECT a.em, a.recurso, u.nome AS usuario_nome, u.perfil AS usuario_perfil
       FROM acessos_prontuario a LEFT JOIN usuarios u ON u.id = a.usuario_id
      WHERE a.paciente_id = $1 ORDER BY a.em DESC LIMIT $2 OFFSET $3`,
    [pacienteId, limite, (pagina - 1) * limite],
  );
  return { itens: rows, pagina, limite, total: total.rows[0].n };
}

/* -------------------------------- Anamnese -------------------------------- */

const SELECT_ANAMNESE = `
  SELECT a.id, a.paciente_id, a.versao, a.respostas_cifrado, a.alertas_cifrado, a.assinada_em, a.criado_em,
         a.profissional_id, u.nome AS profissional_nome
    FROM anamneses a JOIN profissionais p ON p.id = a.profissional_id JOIN usuarios u ON u.id = p.usuario_id`;

const metaAnamnese = (a) => ({
  id: a.id,
  versao: a.versao,
  assinada_em: a.assinada_em,
  criado_em: a.criado_em,
  profissional_nome: a.profissional_nome,
});

async function listarAnamneses(pacienteId) {
  await buscarPaciente(pacienteId);
  const { rows } = await query(
    `${SELECT_ANAMNESE} WHERE a.paciente_id = $1 ORDER BY a.versao DESC`,
    [pacienteId],
  );
  return rows.map(metaAnamnese);
}

async function buscarAnamnese(id) {
  const { rows } = await query(`${SELECT_ANAMNESE} WHERE a.id = $1`, [id]);
  if (!rows[0]) throw erro(404, 'Anamnese não encontrada.');
  const a = rows[0];
  return {
    ...metaAnamnese(a),
    paciente_id: a.paciente_id,
    respostas: decifrarJson(a.respostas_cifrado),
    alertas: decifrarJson(a.alertas_cifrado),
  };
}

/** RF-CLI-003 — cada registro cria uma NOVA versão; a anterior nunca é sobrescrita. */
async function criarAnamnese(pacienteId, profissionalId, { respostas, alertas }) {
  const id = await comTransacao(async (c) => {
    // Trava o paciente para que duas versões simultâneas não recebam o mesmo número.
    const p = await c.query('SELECT id FROM pacientes WHERE id = $1 FOR UPDATE', [pacienteId]);
    if (!p.rows[0]) throw erro(404, 'Paciente não encontrado.');
    const v = await c.query(
      'SELECT COALESCE(max(versao), 0) + 1 AS versao FROM anamneses WHERE paciente_id = $1',
      [pacienteId],
    );
    const { rows } = await c.query(
      `INSERT INTO anamneses (paciente_id, versao, respostas_cifrado, alertas_cifrado, profissional_id)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [
        pacienteId,
        v.rows[0].versao,
        cifrar(JSON.stringify(respostas)),
        cifrar(JSON.stringify(alertas)),
        profissionalId,
      ],
    );
    return rows[0].id;
  });
  return buscarAnamnese(id);
}

/** Assinatura: só o profissional autor, uma única vez. */
async function assinarAnamnese(id, profissionalId) {
  const { rows } = await query('SELECT profissional_id, assinada_em FROM anamneses WHERE id = $1', [
    id,
  ]);
  if (!rows[0]) throw erro(404, 'Anamnese não encontrada.');
  if (rows[0].profissional_id !== profissionalId)
    throw erro(403, 'Só o profissional que registrou pode assinar.');
  if (rows[0].assinada_em) throw erro(409, 'Esta anamnese já foi assinada.');
  await query('UPDATE anamneses SET assinada_em = now(), atualizado_em = now() WHERE id = $1', [
    id,
  ]);
  return buscarAnamnese(id);
}

/* -------------------------------- Evoluções ------------------------------- */

async function listarEvolucoes(pacienteId, { pagina, limite }) {
  await buscarPaciente(pacienteId);
  const total = await query('SELECT count(*)::int AS n FROM evolucoes WHERE paciente_id = $1', [
    pacienteId,
  ]);
  const { rows } = await query(
    `SELECT e.id, e.consulta_id, e.conteudo_cifrado, e.criado_em, u.nome AS profissional_nome
       FROM evolucoes e JOIN profissionais p ON p.id = e.profissional_id JOIN usuarios u ON u.id = p.usuario_id
      WHERE e.paciente_id = $1 ORDER BY e.criado_em DESC LIMIT $2 OFFSET $3`,
    [pacienteId, limite, (pagina - 1) * limite],
  );
  const ids = rows.map((r) => r.id);
  const adendos = ids.length
    ? await query(
        `SELECT a.id, a.evolucao_id, a.conteudo_cifrado, a.criado_em, u.nome AS profissional_nome
           FROM adendos a JOIN profissionais p ON p.id = a.profissional_id JOIN usuarios u ON u.id = p.usuario_id
          WHERE a.evolucao_id = ANY($1::uuid[]) ORDER BY a.criado_em`,
        [ids],
      )
    : { rows: [] };
  const itens = rows.map((e) => ({
    id: e.id,
    consulta_id: e.consulta_id,
    conteudo: decifrar(e.conteudo_cifrado),
    criado_em: e.criado_em,
    profissional_nome: e.profissional_nome,
    adendos: adendos.rows
      .filter((a) => a.evolucao_id === e.id)
      .map((a) => ({
        id: a.id,
        conteudo: decifrar(a.conteudo_cifrado),
        criado_em: a.criado_em,
        profissional_nome: a.profissional_nome,
      })),
  }));
  return { itens, pagina, limite, total: total.rows[0].n };
}

async function criarEvolucao(pacienteId, profissionalId, { conteudo, consulta_id }) {
  await buscarPaciente(pacienteId);
  if (consulta_id) {
    const c = await query('SELECT 1 FROM consultas WHERE id = $1 AND paciente_id = $2', [
      consulta_id,
      pacienteId,
    ]);
    if (!c.rows[0]) throw erro(400, 'A consulta informada não é deste paciente.');
  }
  const { rows } = await query(
    `INSERT INTO evolucoes (paciente_id, consulta_id, conteudo_cifrado, profissional_id)
     VALUES ($1,$2,$3,$4) RETURNING id, criado_em`,
    [pacienteId, consulta_id || null, cifrar(conteudo), profissionalId],
  );
  return { id: rows[0].id, criado_em: rows[0].criado_em, paciente_id: pacienteId };
}

/** RN-006 — correção de evolução é sempre por adendo; o texto original permanece. */
async function criarAdendo(evolucaoId, profissionalId, conteudo) {
  const e = await query('SELECT paciente_id FROM evolucoes WHERE id = $1', [evolucaoId]);
  if (!e.rows[0]) throw erro(404, 'Evolução não encontrada.');
  const { rows } = await query(
    `INSERT INTO adendos (evolucao_id, conteudo_cifrado, profissional_id) VALUES ($1,$2,$3)
     RETURNING id, criado_em`,
    [evolucaoId, cifrar(conteudo), profissionalId],
  );
  return {
    id: rows[0].id,
    criado_em: rows[0].criado_em,
    evolucao_id: evolucaoId,
    paciente_id: e.rows[0].paciente_id,
  };
}

/* ---------------------------- Resumo / linha do tempo ---------------------------- */

async function resumoProntuario(pacienteId) {
  const paciente = await buscarPaciente(pacienteId);
  const ultima = await query(
    `${SELECT_ANAMNESE} WHERE a.paciente_id = $1 ORDER BY a.versao DESC LIMIT 1`,
    [pacienteId],
  );
  const anamnese = ultima.rows[0];

  const [evolucoes, anamneses, procedimentos, anexos, consultas] = await Promise.all([
    query(
      `SELECT e.id, e.criado_em AS em, e.conteudo_cifrado, u.nome AS autor,
              (SELECT count(*)::int FROM adendos a WHERE a.evolucao_id = e.id) AS adendos
         FROM evolucoes e JOIN profissionais p ON p.id = e.profissional_id JOIN usuarios u ON u.id = p.usuario_id
        WHERE e.paciente_id = $1 ORDER BY e.criado_em DESC LIMIT 50`,
      [pacienteId],
    ),
    query(
      `SELECT a.id, a.criado_em AS em, a.versao, a.assinada_em, u.nome AS autor
         FROM anamneses a JOIN profissionais p ON p.id = a.profissional_id JOIN usuarios u ON u.id = p.usuario_id
        WHERE a.paciente_id = $1 ORDER BY a.versao DESC LIMIT 20`,
      [pacienteId],
    ),
    query(
      `SELECT pp.id, COALESCE(pp.data::timestamptz, pp.atualizado_em) AS em, pp.status, pp.dente, c.nome,
              u.nome AS autor
         FROM procedimentos_paciente pp JOIN procedimentos_catalogo c ON c.id = pp.catalogo_id
         LEFT JOIN profissionais p ON p.id = pp.profissional_id LEFT JOIN usuarios u ON u.id = p.usuario_id
        WHERE pp.paciente_id = $1 AND pp.status IN ('concluido','em_andamento') ORDER BY em DESC LIMIT 50`,
      [pacienteId],
    ),
    query(
      `SELECT a.id, a.criado_em AS em, a.tipo, a.nome, u.nome AS autor
         FROM anexos a LEFT JOIN usuarios u ON u.id = a.usuario_id
        WHERE a.paciente_id = $1 ORDER BY a.criado_em DESC LIMIT 50`,
      [pacienteId],
    ),
    query(
      `SELECT c.id, c.inicio AS em, c.status, c.procedimento_previsto, u.nome AS autor
         FROM consultas c JOIN profissionais p ON p.id = c.profissional_id JOIN usuarios u ON u.id = p.usuario_id
        WHERE c.paciente_id = $1 AND c.inicio <= now() ORDER BY c.inicio DESC LIMIT 50`,
      [pacienteId],
    ),
  ]);

  const linha = [
    ...evolucoes.rows.map((e) => ({
      tipo: 'evolucao',
      id: e.id,
      em: e.em,
      autor: e.autor,
      titulo: e.adendos
        ? `Evolução clínica (+${e.adendos} adendo${e.adendos > 1 ? 's' : ''})`
        : 'Evolução clínica',
      resumo: resumir(decifrar(e.conteudo_cifrado)),
    })),
    ...anamneses.rows.map((a) => ({
      tipo: 'anamnese',
      id: a.id,
      em: a.em,
      autor: a.autor,
      titulo: `Anamnese v${a.versao}`,
      resumo: a.assinada_em ? 'Assinada' : 'Aguardando assinatura',
    })),
    ...procedimentos.rows.map((p) => ({
      tipo: 'procedimento',
      id: p.id,
      em: p.em,
      autor: p.autor,
      titulo: p.nome,
      resumo: `${p.dente ? `Dente ${p.dente} · ` : ''}${p.status === 'concluido' ? 'Concluído' : 'Em andamento'}`,
    })),
    ...anexos.rows.map((a) => ({
      tipo: 'anexo',
      id: a.id,
      em: a.em,
      autor: a.autor,
      titulo: a.nome,
      resumo: a.tipo,
    })),
    ...consultas.rows.map((c) => ({
      tipo: 'consulta',
      id: c.id,
      em: c.em,
      autor: c.autor,
      titulo: c.procedimento_previsto || 'Consulta',
      resumo: c.status,
    })),
  ]
    .sort((a, b) => new Date(b.em) - new Date(a.em))
    .slice(0, 100);

  return {
    paciente,
    anamnese_atual: anamnese ? metaAnamnese(anamnese) : null,
    alertas: anamnese ? decifrarJson(anamnese.alertas_cifrado) : [],
    linha_do_tempo: linha,
  };
}

module.exports = {
  erro,
  comTransacao,
  profissionalDoUsuario,
  buscarPaciente,
  registrarAcesso,
  listarAcessos,
  listarAnamneses,
  buscarAnamnese,
  criarAnamnese,
  assinarAnamnese,
  listarEvolucoes,
  criarEvolucao,
  criarAdendo,
  resumoProntuario,
};
