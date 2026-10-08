const { pool, query } = require('../../config/db');
const { parteLocal, paraMinutos, paraHHMM, instanteLocal } = require('../../lib/tempo');
const { mascararCelular } = require('../../lib/mascara');

const ATIVAS = "('faltou','cancelada')"; // status que liberam o horário (RN-010)

const TRANSICOES = {
  agendada: ['confirmada', 'chegou', 'faltou'],
  confirmada: ['chegou', 'faltou'],
  chegou: ['em_atendimento'],
  em_atendimento: ['concluida'],
};
const CANCELAVEIS = ['agendada', 'confirmada', 'chegou'];
const REAGENDAVEIS = ['agendada', 'confirmada'];

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

/* ---------------------------- Profissionais ---------------------------- */

const COL_PROF = `p.id, p.usuario_id, u.nome, p.cro, p.especialidade, p.cor_agenda, p.ativo`;

async function listarProfissionais({ apenasAtivos }) {
  const { rows } = await query(
    `SELECT ${COL_PROF} FROM profissionais p JOIN usuarios u ON u.id = p.usuario_id
      ${apenasAtivos ? 'WHERE p.ativo' : ''} ORDER BY u.nome`,
  );
  return rows;
}

async function buscarProfissional(id) {
  const { rows } = await query(
    `SELECT ${COL_PROF} FROM profissionais p JOIN usuarios u ON u.id = p.usuario_id WHERE p.id = $1`,
    [id],
  );
  if (!rows[0]) throw erro(404, 'Profissional não encontrado.');
  return rows[0];
}

async function criarProfissional({ usuario_id, cro, especialidade, cor_agenda }) {
  const u = await query('SELECT perfil, unidade, status FROM usuarios WHERE id = $1', [usuario_id]);
  if (!u.rows[0] || u.rows[0].unidade !== 'clinica' || u.rows[0].perfil !== 'clinica') {
    throw erro(400, 'O usuário precisa existir e ter o perfil Clínica (dentista).');
  }
  try {
    const { rows } = await query(
      `INSERT INTO profissionais (usuario_id, cro, especialidade, cor_agenda)
       VALUES ($1,$2,$3,COALESCE($4,'#2f7d6d')) RETURNING id`,
      [usuario_id, cro, especialidade || null, cor_agenda || null],
    );
    return buscarProfissional(rows[0].id);
  } catch (err) {
    if (err.code === '23505') throw erro(409, 'Este usuário já é um profissional.');
    throw err;
  }
}

async function atualizarProfissional(id, dados) {
  const antes = await buscarProfissional(id);
  const novo = { ...antes, ...dados };
  await query(
    `UPDATE profissionais SET cro = $2, especialidade = $3, cor_agenda = $4, ativo = $5, atualizado_em = now()
      WHERE id = $1`,
    [id, novo.cro, novo.especialidade, novo.cor_agenda, novo.ativo],
  );
  return { antes, depois: await buscarProfissional(id) };
}

async function listarHorarios(profissionalId) {
  await buscarProfissional(profissionalId);
  const { rows } = await query(
    `SELECT dia_semana, to_char(inicio,'HH24:MI') AS inicio, to_char(fim,'HH24:MI') AS fim
       FROM profissional_horarios WHERE profissional_id = $1 ORDER BY dia_semana, inicio`,
    [profissionalId],
  );
  return rows;
}

async function substituirHorarios(profissionalId, horarios) {
  await buscarProfissional(profissionalId);
  const antes = await listarHorarios(profissionalId);
  const ord = [...horarios].sort(
    (a, b) => a.dia_semana - b.dia_semana || a.inicio.localeCompare(b.inicio),
  );
  for (let i = 1; i < ord.length; i += 1) {
    if (ord[i].dia_semana === ord[i - 1].dia_semana && ord[i].inicio < ord[i - 1].fim) {
      throw erro(400, 'Há janelas sobrepostas no mesmo dia da semana.');
    }
  }
  await comTransacao(async (c) => {
    await c.query('DELETE FROM profissional_horarios WHERE profissional_id = $1', [profissionalId]);
    for (const h of ord) {
      await c.query(
        'INSERT INTO profissional_horarios (profissional_id, dia_semana, inicio, fim) VALUES ($1,$2,$3,$4)',
        [profissionalId, h.dia_semana, h.inicio, h.fim],
      );
    }
  });
  return { antes, depois: await listarHorarios(profissionalId) };
}

/* ------------------------------- Consultas ------------------------------ */

const SELECT_CONSULTA = `
  SELECT c.id, c.inicio, c.fim, c.cadeira, c.status, c.procedimento_previsto, c.motivo_cancelamento,
         pa.id AS paciente_id, pa.nome AS paciente_nome,
         pr.id AS profissional_id, u.nome AS profissional_nome, pr.cor_agenda
    FROM consultas c
    JOIN pacientes pa ON pa.id = c.paciente_id
    JOIN profissionais pr ON pr.id = c.profissional_id
    JOIN usuarios u ON u.id = pr.usuario_id`;

function formatarConsulta(r) {
  return {
    id: r.id,
    inicio: r.inicio,
    fim: r.fim,
    cadeira: r.cadeira,
    status: r.status,
    procedimento_previsto: r.procedimento_previsto,
    motivo_cancelamento: r.motivo_cancelamento,
    paciente: { id: r.paciente_id, nome: r.paciente_nome },
    profissional: { id: r.profissional_id, nome: r.profissional_nome, cor_agenda: r.cor_agenda },
  };
}

async function buscarConsulta(id, { comHistorico = false } = {}) {
  const { rows } = await query(`${SELECT_CONSULTA} WHERE c.id = $1`, [id]);
  if (!rows[0]) throw erro(404, 'Consulta não encontrada.');
  const consulta = formatarConsulta(rows[0]);
  if (comHistorico) {
    const h = await query(
      `SELECT h.de_status, h.para_status, h.observacao, h.em, u.nome AS usuario_nome
         FROM consulta_historico h LEFT JOIN usuarios u ON u.id = h.usuario_id
        WHERE h.consulta_id = $1 ORDER BY h.em, h.criado_em`,
      [id],
    );
    consulta.historico = h.rows;
  }
  return consulta;
}

async function listarConsultas({ inicio, fim, profissional, status }) {
  const cond = ['c.inicio < $2', 'c.fim > $1'];
  const val = [inicio, fim];
  if (profissional) {
    val.push(profissional);
    cond.push(`c.profissional_id = $${val.length}`);
  }
  if (status) {
    val.push(status);
    cond.push(`c.status = $${val.length}`);
  }
  const { rows } = await query(
    `${SELECT_CONSULTA} WHERE ${cond.join(' AND ')} ORDER BY c.inicio`,
    val,
  );
  return rows.map(formatarConsulta);
}

/** Jornada do profissional e bloqueios (feriados, intervalos). Lança 409 com o motivo. */
async function validarJanela(db, { profissionalId, inicio, fim }) {
  const prof = await db.query('SELECT ativo FROM profissionais WHERE id = $1', [profissionalId]);
  if (!prof.rows[0] || !prof.rows[0].ativo) throw erro(400, 'Profissional inexistente ou inativo.');

  const i = parteLocal(inicio);
  const f = parteLocal(fim);
  if (i.data !== f.data) throw erro(400, 'A consulta deve começar e terminar no mesmo dia.');

  const jornada = await db.query(
    `SELECT to_char(inicio,'HH24:MI') AS inicio, to_char(fim,'HH24:MI') AS fim
       FROM profissional_horarios WHERE profissional_id = $1 AND dia_semana = $2`,
    [profissionalId, i.dow],
  );
  const dentro = jornada.rows.some(
    (w) => i.minutos >= paraMinutos(w.inicio) && f.minutos <= paraMinutos(w.fim),
  );
  if (!dentro) throw erro(409, 'Horário fora da jornada do profissional.');

  const bloqueio = await db.query(
    `SELECT motivo FROM bloqueios_agenda
      WHERE (profissional_id IS NULL OR profissional_id = $1) AND tstzrange(inicio, fim) && tstzrange($2, $3) LIMIT 1`,
    [profissionalId, inicio, fim],
  );
  if (bloqueio.rows[0]) throw erro(409, `Horário bloqueado na agenda: ${bloqueio.rows[0].motivo}.`);
}

function traduzirConflito(err) {
  if (err.code === '23P01') {
    return erro(
      409,
      /cadeira/.test(err.constraint || '')
        ? 'Conflito: a cadeira já está ocupada neste horário.'
        : 'Conflito: o profissional já tem consulta neste horário.',
    );
  }
  return err;
}

async function registrarHistorico(db, consultaId, de, para, usuarioId, observacao) {
  await db.query(
    'INSERT INTO consulta_historico (consulta_id, de_status, para_status, usuario_id, observacao) VALUES ($1,$2,$3,$4,$5)',
    [consultaId, de, para, usuarioId, observacao || null],
  );
}

async function criarConsulta(dados, usuarioId) {
  const id = await comTransacao(async (c) => {
    const pac = await c.query('SELECT ativo FROM pacientes WHERE id = $1', [dados.paciente_id]);
    if (!pac.rows[0]) throw erro(400, 'Paciente inexistente.');
    if (!pac.rows[0].ativo) throw erro(400, 'Paciente inativo não pode ser agendado.');
    await validarJanela(c, {
      profissionalId: dados.profissional_id,
      inicio: dados.inicio,
      fim: dados.fim,
    });
    try {
      const { rows } = await c.query(
        `INSERT INTO consultas (paciente_id, profissional_id, cadeira, inicio, fim, procedimento_previsto)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [
          dados.paciente_id,
          dados.profissional_id,
          dados.cadeira,
          dados.inicio,
          dados.fim,
          dados.procedimento_previsto || null,
        ],
      );
      await registrarHistorico(c, rows[0].id, null, 'agendada', usuarioId, 'Consulta agendada');
      return rows[0].id;
    } catch (err) {
      throw traduzirConflito(err);
    }
  });
  return buscarConsulta(id);
}

async function reagendarConsulta(id, dados, usuarioId) {
  const antes = await buscarConsulta(id);
  if (!REAGENDAVEIS.includes(antes.status))
    throw erro(409, `Consulta ${antes.status} não pode ser reagendada.`);
  const novo = {
    profissional_id: dados.profissional_id || antes.profissional.id,
    cadeira: dados.cadeira ?? antes.cadeira,
    inicio: dados.inicio || antes.inicio.toISOString(),
    fim: dados.fim || antes.fim.toISOString(),
    procedimento_previsto:
      'procedimento_previsto' in dados ? dados.procedimento_previsto : antes.procedimento_previsto,
  };
  if (new Date(novo.fim) <= new Date(novo.inicio))
    throw erro(400, 'O fim deve ser depois do início.');

  await comTransacao(async (c) => {
    await validarJanela(c, {
      profissionalId: novo.profissional_id,
      inicio: novo.inicio,
      fim: novo.fim,
    });
    try {
      await c.query(
        `UPDATE consultas SET profissional_id = $2, cadeira = $3, inicio = $4, fim = $5,
           procedimento_previsto = $6, atualizado_em = now() WHERE id = $1`,
        [id, novo.profissional_id, novo.cadeira, novo.inicio, novo.fim, novo.procedimento_previsto],
      );
    } catch (err) {
      throw traduzirConflito(err);
    }
    await registrarHistorico(c, id, antes.status, antes.status, usuarioId, 'Consulta reagendada');
  });
  return { antes, depois: await buscarConsulta(id) };
}

async function mudarStatus(id, para, usuarioId) {
  const antes = await buscarConsulta(id);
  if (!(TRANSICOES[antes.status] || []).includes(para)) {
    throw erro(409, `Não é possível mover de "${antes.status}" para "${para}".`);
  }
  await comTransacao(async (c) => {
    await c.query('UPDATE consultas SET status = $2, atualizado_em = now() WHERE id = $1', [
      id,
      para,
    ]);
    await registrarHistorico(c, id, antes.status, para, usuarioId, null);
  });
  return { antes, depois: await buscarConsulta(id) };
}

async function cancelarConsulta(id, motivo, usuarioId) {
  const antes = await buscarConsulta(id);
  if (!CANCELAVEIS.includes(antes.status))
    throw erro(409, `Consulta ${antes.status} não pode ser cancelada.`);
  await comTransacao(async (c) => {
    await c.query(
      "UPDATE consultas SET status = 'cancelada', motivo_cancelamento = $2, atualizado_em = now() WHERE id = $1",
      [id, motivo],
    );
    await registrarHistorico(c, id, antes.status, 'cancelada', usuarioId, motivo);
  });
  return { antes, depois: await buscarConsulta(id) };
}

const dataBR = (d) => parteLocal(d).data.split('-').reverse().join('/');
const horaBR = (d) => paraHHMM(parteLocal(d).minutos);

/** Link wa.me com mensagem pronta (decisão D-03: sem API paga). */
async function lembreteWhatsapp(id) {
  const { rows } = await query(
    `SELECT c.inicio, c.status, pa.nome, pa.celular, u.nome AS profissional
       FROM consultas c JOIN pacientes pa ON pa.id = c.paciente_id
       JOIN profissionais pr ON pr.id = c.profissional_id JOIN usuarios u ON u.id = pr.usuario_id
      WHERE c.id = $1`,
    [id],
  );
  const c = rows[0];
  if (!c) throw erro(404, 'Consulta não encontrada.');
  if (!c.celular) throw erro(400, 'Paciente sem celular cadastrado.');
  if (!['agendada', 'confirmada'].includes(c.status))
    throw erro(409, 'Só há lembrete para consultas a realizar.');

  const mensagem =
    `Olá, ${c.nome.split(' ')[0]}! Lembrando da sua consulta na QuickOdonto em ${dataBR(c.inicio)} ` +
    `às ${horaBR(c.inicio)} com ${c.profissional}. Pode confirmar sua presença?`;
  const numero =
    c.celular.startsWith('55') && c.celular.length >= 12 ? c.celular : `55${c.celular}`;
  return {
    url: `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`,
    celular: mascararCelular(c.celular),
  };
}

/* ------------------------------- Bloqueios ------------------------------ */

async function listarBloqueios({ inicio, fim, profissional }) {
  const cond = ['b.inicio < $2', 'b.fim > $1'];
  const val = [inicio, fim];
  if (profissional) {
    val.push(profissional);
    cond.push(`(b.profissional_id = $${val.length} OR b.profissional_id IS NULL)`);
  }
  const { rows } = await query(
    `SELECT b.id, b.profissional_id, u.nome AS profissional_nome, b.inicio, b.fim, b.motivo
       FROM bloqueios_agenda b LEFT JOIN profissionais p ON p.id = b.profissional_id
       LEFT JOIN usuarios u ON u.id = p.usuario_id
      WHERE ${cond.join(' AND ')} ORDER BY b.inicio`,
    val,
  );
  return rows;
}

async function criarBloqueio({ profissional_id, inicio, fim, motivo }, usuarioId) {
  if (profissional_id) await buscarProfissional(profissional_id);
  const conflito = await query(
    `SELECT count(*)::int AS n FROM consultas
      WHERE status NOT IN ${ATIVAS} AND tstzrange(inicio, fim) && tstzrange($1, $2)
        AND ($3::uuid IS NULL OR profissional_id = $3)`,
    [inicio, fim, profissional_id || null],
  );
  if (conflito.rows[0].n) {
    throw erro(
      409,
      `Há ${conflito.rows[0].n} consulta(s) no período: reagende ou cancele antes de bloquear.`,
    );
  }
  const { rows } = await query(
    `INSERT INTO bloqueios_agenda (profissional_id, inicio, fim, motivo, criado_por)
     VALUES ($1,$2,$3,$4,$5) RETURNING id, profissional_id, inicio, fim, motivo`,
    [profissional_id || null, inicio, fim, motivo, usuarioId],
  );
  return rows[0];
}

async function removerBloqueio(id) {
  const { rows } = await query(
    'DELETE FROM bloqueios_agenda WHERE id = $1 RETURNING id, profissional_id, inicio, fim, motivo',
    [id],
  );
  if (!rows[0]) throw erro(404, 'Bloqueio não encontrado.');
  return rows[0];
}

/* ----------------------------- Disponibilidade -------------------------- */

async function disponibilidade({ profissional, data, duracao }) {
  await buscarProfissional(profissional);
  const inicioDia = instanteLocal(data, 0);
  const fimDia = new Date(inicioDia.getTime() + 24 * 3600000);
  const dow = parteLocal(instanteLocal(data, 720)).dow;

  const jornada = await query(
    `SELECT to_char(inicio,'HH24:MI') AS inicio, to_char(fim,'HH24:MI') AS fim
       FROM profissional_horarios WHERE profissional_id = $1 AND dia_semana = $2 ORDER BY inicio`,
    [profissional, dow],
  );
  const ocupado = await query(
    `SELECT inicio, fim FROM consultas
      WHERE profissional_id = $1 AND status NOT IN ${ATIVAS} AND inicio < $3 AND fim > $2
     UNION ALL
     SELECT inicio, fim FROM bloqueios_agenda
      WHERE (profissional_id IS NULL OR profissional_id = $1) AND inicio < $3 AND fim > $2`,
    [profissional, inicioDia, fimDia],
  );

  const agora = Date.now();
  const livres = [];
  for (const w of jornada.rows) {
    for (let m = paraMinutos(w.inicio); m + duracao <= paraMinutos(w.fim); m += duracao) {
      const ini = instanteLocal(data, m);
      const fim = instanteLocal(data, m + duracao);
      const colide = ocupado.rows.some((o) => new Date(o.inicio) < fim && new Date(o.fim) > ini);
      if (!colide && ini.getTime() > agora)
        livres.push({ inicio: ini.toISOString(), fim: fim.toISOString() });
    }
  }
  return { profissional, data, duracao, livres };
}

module.exports = {
  listarProfissionais,
  buscarProfissional,
  criarProfissional,
  atualizarProfissional,
  listarHorarios,
  substituirHorarios,
  buscarConsulta,
  listarConsultas,
  criarConsulta,
  reagendarConsulta,
  mudarStatus,
  cancelarConsulta,
  lembreteWhatsapp,
  listarBloqueios,
  criarBloqueio,
  removerBloqueio,
  disponibilidade,
};
