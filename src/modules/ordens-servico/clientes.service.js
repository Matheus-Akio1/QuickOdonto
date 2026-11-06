const { query } = require('../../config/db');
const { cifrar, decifrar, hashBusca } = require('../../lib/crypto');
const { mascararDocumento, mascararCelular } = require('../../lib/mascara');
const { somenteDigitos, cpfValido, cnpjValido } = require('../../lib/validacoes');
const os = require('./os.service');

const { erro, HOJE } = os;

const COLUNAS = `c.id, c.tipo, c.razao_social, c.documento_tipo, c.documento_cifrado, c.responsavel, c.cro,
  c.telefone, c.email, c.endereco, c.condicao_pagamento, c.ativo, c.criado_em`;

// No laboratório, OS da clínica só conta depois de enviada.
const OS_ABERTAS = `(SELECT count(*)::int FROM ordens_servico o
   WHERE o.cliente_id = c.id AND o.status = 'aberta' AND o.etapa_producao IS NOT NULL)`;

/** Documento e telefone sempre mascarados (seção 3.1); o valor completo sai por /revelar, auditado. */
function serializar(c) {
  return {
    id: c.id,
    tipo: c.tipo,
    razao_social: c.razao_social,
    documento_tipo: c.documento_tipo,
    documento: c.documento_cifrado ? mascararDocumento(decifrar(c.documento_cifrado)) : null,
    responsavel: c.responsavel,
    cro: c.cro,
    telefone: mascararCelular(c.telefone),
    email: c.email,
    endereco: c.endereco,
    condicao_pagamento: c.condicao_pagamento,
    ativo: c.ativo,
    criado_em: c.criado_em,
    os_abertas: c.os_abertas ?? 0,
  };
}

async function buscarLinha(id) {
  const { rows } = await query(
    `SELECT ${COLUNAS}, c.documento_hash, ${OS_ABERTAS} AS os_abertas FROM laboratorio_clientes c WHERE c.id = $1`,
    [id],
  );
  if (!rows[0]) throw erro(404, 'Cliente não encontrado.');
  return rows[0];
}

async function listar({ tipo, ativo }) {
  const cond = [];
  const val = [];
  if (ativo !== 'todos') {
    val.push(ativo === 'true');
    cond.push(`c.ativo = $${val.length}`);
  }
  if (tipo) {
    val.push(tipo);
    cond.push(`c.tipo = $${val.length}`);
  }
  const { rows } = await query(
    `SELECT ${COLUNAS}, ${OS_ABERTAS} AS os_abertas FROM laboratorio_clientes c
      ${cond.length ? `WHERE ${cond.join(' AND ')}` : ''}
      ORDER BY (c.tipo = 'interno') DESC, c.razao_social`,
    val,
  );
  return rows.map(serializar);
}

/** Mapeia o objeto validado para colunas (cifrando/hasheando o documento). */
function paraColunas(d) {
  const c = {};
  if ('razao_social' in d) c.razao_social = d.razao_social;
  if ('documento' in d) {
    const doc = d.documento ? somenteDigitos(d.documento) : null;
    if (doc && !(doc.length === 14 ? cnpjValido(doc) : cpfValido(doc))) {
      throw erro(400, 'CNPJ ou CPF inválido.');
    }
    c.documento_tipo = doc ? (doc.length === 14 ? 'cnpj' : 'cpf') : null;
    c.documento_cifrado = doc ? cifrar(doc) : null;
    c.documento_hash = doc ? hashBusca(doc) : null;
  }
  if ('responsavel' in d) c.responsavel = d.responsavel || null;
  if ('cro' in d) c.cro = d.cro || null;
  if ('telefone' in d) c.telefone = d.telefone ? somenteDigitos(d.telefone) : null;
  if ('email' in d) c.email = d.email ? d.email.toLowerCase() : null;
  if ('endereco' in d) c.endereco = d.endereco ? JSON.stringify(d.endereco) : null;
  if ('condicao_pagamento' in d) c.condicao_pagamento = d.condicao_pagamento || null;
  if ('ativo' in d) c.ativo = d.ativo;
  return c;
}

function traduzirErroBanco(err) {
  if (err.code === '23505' && /documento_hash/.test(err.detail || err.constraint || '')) {
    return erro(409, 'Já existe um cliente com este CNPJ/CPF.');
  }
  return err;
}

async function criar(dados) {
  const c = { tipo: 'externo', ...paraColunas(dados) };
  const campos = Object.keys(c);
  try {
    const { rows } = await query(
      `INSERT INTO laboratorio_clientes (${campos.join(', ')})
       VALUES (${campos.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`,
      campos.map((k) => c[k]),
    );
    return serializar(await buscarLinha(rows[0].id));
  } catch (err) {
    throw traduzirErroBanco(err);
  }
}

async function atualizar(id, dados) {
  const antes = await buscarLinha(id);
  if (antes.tipo === 'interno' && dados.ativo === false) {
    throw erro(409, 'A clínica própria não pode ser inativada.');
  }
  const c = paraColunas(dados);
  const campos = Object.keys(c);
  try {
    await query(
      `UPDATE laboratorio_clientes SET ${campos.map((k, i) => `${k} = $${i + 2}`).join(', ')},
              atualizado_em = now() WHERE id = $1`,
      [id, ...campos.map((k) => c[k])],
    );
  } catch (err) {
    throw traduzirErroBanco(err);
  }
  return { antes: serializar(antes), depois: serializar(await buscarLinha(id)) };
}

async function revelar(id, campo) {
  const c = await buscarLinha(id);
  if (campo === 'documento') return c.documento_cifrado ? decifrar(c.documento_cifrado) : null;
  if (campo === 'telefone') return c.telefone;
  throw erro(400, 'Campo não pode ser revelado.');
}

/** Caderno do cliente: dados, indicadores do mês e as OS (em produção por ordem de chegada + entregues). */
async function caderno(id, usuario) {
  const cliente = serializar(await buscarLinha(id));
  const ind = await query(
    `SELECT
       count(*) FILTER (WHERE o.status = 'concluida'
         AND o.concluida_em >= date_trunc('month', ${HOJE}::timestamp) AT TIME ZONE 'America/Sao_Paulo')::int AS entregues_mes,
       count(*) FILTER (WHERE o.status = 'concluida' AND o.previsao_entrega IS NOT NULL
         AND o.concluida_em >= date_trunc('month', ${HOJE}::timestamp) AT TIME ZONE 'America/Sao_Paulo'
         AND (o.concluida_em AT TIME ZONE 'America/Sao_Paulo')::date <= o.previsao_entrega)::int AS no_prazo_mes,
       (SELECT count(*)::int FROM os_refacoes r JOIN ordens_servico o2 ON o2.id = r.os_id
         WHERE o2.cliente_id = $1
           AND r.data >= date_trunc('month', ${HOJE}::timestamp) AT TIME ZONE 'America/Sao_Paulo') AS refacoes_mes
       FROM ordens_servico o WHERE o.cliente_id = $1`,
    [id],
  );
  const i = ind.rows[0];
  const lista = async (cond, ordem, limite) => {
    const { rows } = await query(
      `${os.SELECT_OS} WHERE o.cliente_id = $1 AND o.etapa_producao IS NOT NULL AND ${cond}
        ORDER BY ${ordem} LIMIT ${limite}`,
      [id],
    );
    return rows.map((r) => os.formatar(r, usuario));
  };
  return {
    cliente,
    indicadores: {
      os_abertas: cliente.os_abertas,
      entregues_mes: i.entregues_mes,
      no_prazo_pct: i.entregues_mes ? Math.round((i.no_prazo_mes * 100) / i.entregues_mes) : null,
      refacoes_mes: i.refacoes_mes,
    },
    em_producao: await lista(
      "o.status = 'aberta'",
      'COALESCE(o.enviado_em, o.criado_em), o.numero',
      200,
    ),
    entregues: await lista("o.status = 'concluida'", 'o.concluida_em DESC', 30),
  };
}

module.exports = { serializar, listar, criar, atualizar, revelar, caderno, buscarLinha };
