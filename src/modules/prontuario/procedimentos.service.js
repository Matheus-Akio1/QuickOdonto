const { query } = require('../../config/db');
const { cifrar, decifrar } = require('../../lib/crypto');
const { erro, comTransacao, buscarPaciente } = require('./prontuario.service');

const HOJE_SP = "(now() AT TIME ZONE 'America/Sao_Paulo')::date";
const num = (v) => (v === null || v === undefined ? null : Number(v));

/* -------------------------------- Catálogo -------------------------------- */

const COL_CATALOGO = 'id, codigo, nome, especialidade, duracao_min, valor_padrao, ativo';
const fmtCatalogo = (c) => ({ ...c, valor_padrao: num(c.valor_padrao) });

async function listarCatalogo({ busca, ativo }) {
  const cond = [];
  const val = [];
  if (ativo !== 'todos') {
    val.push(ativo === 'true');
    cond.push(`ativo = $${val.length}`);
  }
  if (busca) {
    val.push(`%${busca.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
    cond.push(`(nome ILIKE $${val.length} OR codigo ILIKE $${val.length})`);
  }
  const { rows } = await query(
    `SELECT ${COL_CATALOGO} FROM procedimentos_catalogo ${cond.length ? `WHERE ${cond.join(' AND ')}` : ''}
      ORDER BY nome`,
    val,
  );
  return rows.map(fmtCatalogo);
}

async function buscarCatalogo(id) {
  const { rows } = await query(`SELECT ${COL_CATALOGO} FROM procedimentos_catalogo WHERE id = $1`, [
    id,
  ]);
  if (!rows[0]) throw erro(404, 'Procedimento do catálogo não encontrado.');
  return fmtCatalogo(rows[0]);
}

async function criarCatalogo(d) {
  try {
    const { rows } = await query(
      `INSERT INTO procedimentos_catalogo (codigo, nome, especialidade, duracao_min, valor_padrao)
       VALUES ($1,$2,$3,$4,$5) RETURNING ${COL_CATALOGO}`,
      [d.codigo, d.nome, d.especialidade ?? null, d.duracao_min, d.valor_padrao],
    );
    return fmtCatalogo(rows[0]);
  } catch (err) {
    if (err.code === '23505') throw erro(409, 'Já existe um procedimento com este código.');
    throw err;
  }
}

async function atualizarCatalogo(id, d) {
  const antes = await buscarCatalogo(id);
  const n = { ...antes, ...d };
  try {
    await query(
      `UPDATE procedimentos_catalogo SET codigo=$2, nome=$3, especialidade=$4, duracao_min=$5, valor_padrao=$6,
         ativo=$7, atualizado_em=now() WHERE id=$1`,
      [id, n.codigo, n.nome, n.especialidade, n.duracao_min, n.valor_padrao, n.ativo],
    );
  } catch (err) {
    if (err.code === '23505') throw erro(409, 'Já existe um procedimento com este código.');
    throw err;
  }
  return { antes, depois: await buscarCatalogo(id) };
}

/* ------------------------- Procedimentos do paciente ------------------------- */

const SELECT_PROC = `
  SELECT pp.id, pp.paciente_id, pp.dente, pp.faces, pp.status, pp.data::text AS data, pp.valor,
         pp.observacao_cifrado, pp.plano_id, pp.criado_em,
         c.id AS catalogo_id, c.codigo, c.nome, u.nome AS profissional_nome
    FROM procedimentos_paciente pp
    JOIN procedimentos_catalogo c ON c.id = pp.catalogo_id
    LEFT JOIN profissionais p ON p.id = pp.profissional_id
    LEFT JOIN usuarios u ON u.id = p.usuario_id`;

async function adendosDe(ids) {
  if (!ids.length) return [];
  const { rows } = await query(
    `SELECT a.id, a.procedimento_id, a.conteudo_cifrado, a.criado_em, u.nome AS autor
       FROM procedimento_adendos a LEFT JOIN usuarios u ON u.id = a.usuario_id
      WHERE a.procedimento_id = ANY($1::uuid[]) ORDER BY a.criado_em`,
    [ids],
  );
  return rows;
}

function formatar(p, adendos = []) {
  return {
    id: p.id,
    paciente_id: p.paciente_id,
    catalogo: { id: p.catalogo_id, codigo: p.codigo, nome: p.nome },
    dente: p.dente,
    faces: p.faces,
    status: p.status,
    data: p.data,
    valor: num(p.valor),
    observacao: p.observacao_cifrado ? decifrar(p.observacao_cifrado) : null,
    profissional_nome: p.profissional_nome,
    plano_id: p.plano_id,
    criado_em: p.criado_em,
    adendos: adendos
      .filter((a) => a.procedimento_id === p.id)
      .map((a) => ({
        id: a.id,
        conteudo: decifrar(a.conteudo_cifrado),
        criado_em: a.criado_em,
        autor: a.autor,
      })),
  };
}

async function buscarProcedimento(id) {
  const { rows } = await query(`${SELECT_PROC} WHERE pp.id = $1`, [id]);
  if (!rows[0]) throw erro(404, 'Procedimento não encontrado.');
  return formatar(rows[0], await adendosDe([id]));
}

async function listarProcedimentos(pacienteId) {
  await buscarPaciente(pacienteId);
  const { rows } = await query(
    `${SELECT_PROC} WHERE pp.paciente_id = $1 ORDER BY COALESCE(pp.data, pp.criado_em::date) DESC, pp.criado_em DESC`,
    [pacienteId],
  );
  const adendos = await adendosDe(rows.map((r) => r.id));
  return rows.map((r) => formatar(r, adendos));
}

async function criarProcedimento(pacienteId, profissionalId, d) {
  await buscarPaciente(pacienteId);
  const cat = await buscarCatalogo(d.catalogo_id);
  if (!cat.ativo) throw erro(400, 'Procedimento do catálogo está inativo.');
  const status = d.status ?? 'planejado';
  const { rows } = await query(
    `INSERT INTO procedimentos_paciente
       (paciente_id, catalogo_id, dente, faces, status, profissional_id, data, valor, observacao_cifrado)
     VALUES ($1,$2,$3,$4,$5,$6, COALESCE($7::date, CASE WHEN $5 = 'concluido' THEN ${HOJE_SP} END), $8, $9)
     RETURNING id`,
    [
      pacienteId,
      cat.id,
      d.dente ?? null,
      d.faces ?? [],
      status,
      profissionalId,
      d.data ?? null,
      d.valor ?? cat.valor_padrao,
      d.observacao ? cifrar(d.observacao) : null,
    ],
  );
  return buscarProcedimento(rows[0].id);
}

const TRANSICOES = {
  planejado: ['em_andamento', 'concluido', 'cancelado'],
  em_andamento: ['concluido', 'cancelado'],
  concluido: [],
  cancelado: [],
};

/**
 * RN-006 — enquanto aberto, o procedimento pode ser editado; concluído ou cancelado,
 * só aceita adendo (o banco também recusa qualquer UPDATE nesses estados).
 */
async function atualizarProcedimento(id, usuarioId, profissionalId, { adendo, ...campos }) {
  const antes = await buscarProcedimento(id);
  const fechado = ['concluido', 'cancelado'].includes(antes.status);
  const temCampos = Object.keys(campos).length > 0;

  if (fechado && temCampos) {
    throw erro(
      409,
      `Procedimento ${antes.status === 'concluido' ? 'concluído' : 'cancelado'} só aceita adendo (RN-006).`,
    );
  }
  if (
    campos.status &&
    campos.status !== antes.status &&
    !TRANSICOES[antes.status].includes(campos.status)
  ) {
    throw erro(409, `Não é possível mudar de "${antes.status}" para "${campos.status}".`);
  }
  const dente = 'dente' in campos ? campos.dente : antes.dente;
  const faces = 'faces' in campos ? campos.faces : antes.faces;
  if (faces.length && !dente) throw erro(400, 'Faces exigem o dente.');

  await comTransacao(async (c) => {
    if (temCampos) {
      const novo = { ...antes, ...campos, dente, faces };
      const executando = ['em_andamento', 'concluido'].includes(novo.status);
      const trocaObservacao = 'observacao' in campos;
      await c.query(
        `UPDATE procedimentos_paciente SET dente=$2, faces=$3, status=$4,
           data = COALESCE($5::date, CASE WHEN $4 = 'concluido' THEN ${HOJE_SP} END),
           valor=$6,
           observacao_cifrado = CASE WHEN $7 THEN $8 ELSE observacao_cifrado END,
           profissional_id = CASE WHEN $9 THEN COALESCE(profissional_id, $10) ELSE profissional_id END,
           atualizado_em=now()
         WHERE id=$1`,
        [
          id,
          dente,
          faces,
          novo.status,
          'data' in campos ? campos.data : antes.data,
          novo.valor,
          trocaObservacao,
          trocaObservacao && campos.observacao ? cifrar(campos.observacao) : null,
          executando,
          profissionalId,
        ],
      );
    }
    if (adendo) {
      await c.query(
        'INSERT INTO procedimento_adendos (procedimento_id, conteudo_cifrado, usuario_id) VALUES ($1,$2,$3)',
        [id, cifrar(adendo), usuarioId],
      );
    }
  });
  return { antes, depois: await buscarProcedimento(id) };
}

/** Situação por elemento (FDI), derivada dos procedimentos não cancelados. */
async function odontograma(pacienteId) {
  const lista = await listarProcedimentos(pacienteId);
  const dentes = {};
  for (const p of lista) {
    if (!p.dente || p.status === 'cancelado') continue;
    const d = (dentes[p.dente] ??= { situacao: null, procedimentos: [] });
    d.procedimentos.push({
      id: p.id,
      nome: p.catalogo.nome,
      faces: p.faces,
      status: p.status,
      data: p.data,
    });
  }
  const prioridade = ['em_andamento', 'planejado', 'concluido'];
  for (const d of Object.values(dentes)) {
    d.situacao = prioridade.find((s) => d.procedimentos.some((p) => p.status === s)) ?? null;
  }
  return { dentes };
}

/* --------------------------------- Planos --------------------------------- */

async function buscarPlano(id) {
  const { rows } = await query(
    `SELECT pl.id, pl.paciente_id, pl.status, pl.observacao_cifrado, pl.total, pl.criado_em, pl.aprovado_em,
            uc.nome AS criado_por_nome, ua.nome AS aprovado_por_nome, up.nome AS profissional_nome
       FROM planos_tratamento pl
       LEFT JOIN usuarios uc ON uc.id = pl.criado_por
       LEFT JOIN usuarios ua ON ua.id = pl.aprovado_por
       LEFT JOIN profissionais p ON p.id = pl.profissional_id LEFT JOIN usuarios up ON up.id = p.usuario_id
      WHERE pl.id = $1`,
    [id],
  );
  if (!rows[0]) throw erro(404, 'Plano de tratamento não encontrado.');
  const itens = await query(
    `SELECT i.id, i.dente, i.faces, i.valor, i.procedimento_id, c.id AS catalogo_id, c.codigo, c.nome
       FROM plano_itens i JOIN procedimentos_catalogo c ON c.id = i.catalogo_id
      WHERE i.plano_id = $1 ORDER BY i.criado_em, i.id`,
    [id],
  );
  const p = rows[0];
  return {
    id: p.id,
    paciente_id: p.paciente_id,
    status: p.status,
    observacao: p.observacao_cifrado ? decifrar(p.observacao_cifrado) : null,
    total: num(p.total),
    profissional_nome: p.profissional_nome,
    criado_por_nome: p.criado_por_nome,
    criado_em: p.criado_em,
    aprovado_em: p.aprovado_em,
    aprovado_por_nome: p.aprovado_por_nome,
    itens: itens.rows.map((i) => ({
      id: i.id,
      catalogo: { id: i.catalogo_id, codigo: i.codigo, nome: i.nome },
      dente: i.dente,
      faces: i.faces,
      valor: num(i.valor),
      procedimento_id: i.procedimento_id,
    })),
  };
}

async function listarPlanos(pacienteId) {
  await buscarPaciente(pacienteId);
  const { rows } = await query(
    'SELECT id FROM planos_tratamento WHERE paciente_id = $1 ORDER BY criado_em DESC',
    [pacienteId],
  );
  return Promise.all(rows.map((r) => buscarPlano(r.id)));
}

async function criarPlano({ paciente_id, observacao, itens }, usuarioId, profissionalId) {
  await buscarPaciente(paciente_id);
  const catalogo = await query(
    'SELECT id, valor_padrao, ativo FROM procedimentos_catalogo WHERE id = ANY($1::uuid[])',
    [[...new Set(itens.map((i) => i.catalogo_id))]],
  );
  const porId = Object.fromEntries(catalogo.rows.map((c) => [c.id, c]));
  for (const i of itens) {
    if (!porId[i.catalogo_id]?.ativo)
      throw erro(400, 'Há procedimento inexistente ou inativo no plano.');
    if ((i.faces ?? []).length && !i.dente) throw erro(400, 'Faces exigem o dente.');
  }
  const valores = itens.map((i) => i.valor ?? Number(porId[i.catalogo_id].valor_padrao));
  const total = valores.reduce((a, v) => a + v, 0);

  const id = await comTransacao(async (c) => {
    const { rows } = await c.query(
      `INSERT INTO planos_tratamento (paciente_id, profissional_id, observacao_cifrado, total, criado_por)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [
        paciente_id,
        profissionalId,
        observacao ? cifrar(observacao) : null,
        total.toFixed(2),
        usuarioId,
      ],
    );
    for (const [n, i] of itens.entries()) {
      await c.query(
        'INSERT INTO plano_itens (plano_id, catalogo_id, dente, faces, valor) VALUES ($1,$2,$3,$4,$5)',
        [rows[0].id, i.catalogo_id, i.dente ?? null, i.faces ?? [], valores[n].toFixed(2)],
      );
    }
    return rows[0].id;
  });
  return buscarPlano(id);
}

/**
 * Aprovação do orçamento: congela o plano e lança cada item no prontuário como procedimento
 * "planejado". A geração das contas a receber entra no M6 (financeiro), a partir de planos aprovados.
 */
async function aprovarPlano(id, usuarioId) {
  const antes = await buscarPlano(id);
  if (antes.status === 'aprovado') throw erro(409, 'Este plano já foi aprovado.');
  await comTransacao(async (c) => {
    const trava = await c.query('SELECT status FROM planos_tratamento WHERE id = $1 FOR UPDATE', [
      id,
    ]);
    if (trava.rows[0].status === 'aprovado') throw erro(409, 'Este plano já foi aprovado.');
    for (const i of antes.itens) {
      const { rows } = await c.query(
        `INSERT INTO procedimentos_paciente (paciente_id, catalogo_id, dente, faces, status, valor, plano_id)
         VALUES ($1,$2,$3,$4,'planejado',$5,$6) RETURNING id`,
        [antes.paciente_id, i.catalogo.id, i.dente, i.faces, i.valor.toFixed(2), id],
      );
      await c.query(
        'UPDATE plano_itens SET procedimento_id = $2, atualizado_em = now() WHERE id = $1',
        [i.id, rows[0].id],
      );
    }
    await c.query(
      "UPDATE planos_tratamento SET status='aprovado', aprovado_em=now(), aprovado_por=$2, atualizado_em=now() WHERE id=$1",
      [id, usuarioId],
    );
  });
  return { antes, depois: await buscarPlano(id) };
}

module.exports = {
  listarCatalogo,
  buscarCatalogo,
  criarCatalogo,
  atualizarCatalogo,
  listarProcedimentos,
  buscarProcedimento,
  criarProcedimento,
  atualizarProcedimento,
  odontograma,
  listarPlanos,
  buscarPlano,
  criarPlano,
  aprovarPlano,
};
