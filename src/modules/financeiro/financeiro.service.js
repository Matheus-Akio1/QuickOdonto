const crypto = require('crypto');
const { pool, query } = require('../../config/db');
const { decifrar } = require('../../lib/crypto');
const { mascararDocumento } = require('../../lib/mascara');

const HOJE = "(now() AT TIME ZONE 'America/Sao_Paulo')::date";
const FORMAS = ['pix', 'dinheiro', 'credito', 'debito', 'boleto', 'transferencia'];
const DIAS_VENCIMENTO_OS = 30;

function erro(status, mensagem) {
  return Object.assign(new Error(mensagem), { status });
}
const centavos = (v) => Math.round(Number(v) * 100);
const reais = (c) => Math.round(c) / 100;

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

/** Erros levantados pelos triggers viram respostas legíveis (RN-011 e saldo do título). */
function traduzirErroBanco(err) {
  const m = err.message || '';
  if (/caixa do dia fechado/.test(m)) {
    return erro(409, 'O caixa deste dia está fechado: reabra com justificativa antes de lançar.');
  }
  if (/baixa maior que o saldo/.test(m)) return erro(409, 'A baixa é maior que o saldo em aberto.');
  if (/cancelado não recebe baixa/.test(m))
    return erro(409, 'Lançamento cancelado não recebe baixa.');
  return err;
}

/* ------------------------------ categorias ------------------------------ */

async function listarCategorias(usuario) {
  const { rows } = await query(
    `SELECT id, tipo, nome, chave FROM categorias_financeiras
      WHERE unidade = $1 AND ativo ORDER BY tipo DESC, nome`,
    [usuario.unidade],
  );
  return rows;
}

async function criarCategoria(d, usuario) {
  try {
    const { rows } = await query(
      'INSERT INTO categorias_financeiras (unidade, tipo, nome) VALUES ($1,$2,$3) RETURNING id, tipo, nome, chave',
      [usuario.unidade, d.tipo, d.nome],
    );
    return rows[0];
  } catch (err) {
    if (err.code === '23505') throw erro(409, 'Já existe uma categoria com este nome.');
    throw err;
  }
}

async function categoriaDoSistema(db, unidade, chave) {
  const { rows } = await db.query(
    'SELECT id FROM categorias_financeiras WHERE unidade = $1 AND chave = $2',
    [unidade, chave],
  );
  return rows[0].id;
}

/* ------------------------------ lançamentos ------------------------------ */

const SELECT_LANCAMENTO = `
  SELECT l.id, l.tipo, l.descricao, l.valor, l.valor_pago, l.vencimento::text AS vencimento,
         l.pagamento::text AS pagamento, l.forma, l.situacao, l.parcela, l.parcelas, l.recorrencia,
         l.grupo_id, l.motivo_cancelamento, l.criado_em, l.os_id, l.plano_id,
         (l.vencimento - ${HOJE}) AS dias,
         c.id AS categoria_id, c.nome AS categoria_nome,
         p.id AS paciente_id, p.nome AS paciente_nome,
         lc.id AS cliente_id, lc.razao_social AS cliente_nome,
         o.numero AS os_numero
    FROM lancamentos l
    JOIN categorias_financeiras c ON c.id = l.categoria_id
    LEFT JOIN pacientes p ON p.id = l.paciente_id
    LEFT JOIN laboratorio_clientes lc ON lc.id = l.cliente_id
    LEFT JOIN ordens_servico o ON o.id = l.os_id`;

function formatar(r) {
  const emAberto = r.situacao === 'aberto' || r.situacao === 'parcial';
  return {
    id: r.id,
    tipo: r.tipo,
    descricao: r.descricao,
    valor: Number(r.valor),
    valor_pago: Number(r.valor_pago),
    saldo: emAberto ? reais(centavos(r.valor) - centavos(r.valor_pago)) : 0,
    vencimento: r.vencimento,
    pagamento: r.pagamento,
    forma: r.forma,
    situacao: r.situacao,
    atrasado: emAberto && r.dias < 0,
    parcela: r.parcela,
    parcelas: r.parcelas,
    recorrencia: r.recorrencia,
    motivo_cancelamento: r.motivo_cancelamento,
    criado_em: r.criado_em,
    categoria: { id: r.categoria_id, nome: r.categoria_nome },
    paciente: r.paciente_id ? { id: r.paciente_id, nome: r.paciente_nome } : null,
    cliente: r.cliente_id ? { id: r.cliente_id, nome: r.cliente_nome } : null,
    os: r.os_id ? { id: r.os_id, numero: r.os_numero } : null,
  };
}

/** RN-008/RN-014 — a unidade vem sempre do usuário logado; título de outra unidade é 404. */
async function buscar(id, usuario, db = { query }) {
  const { rows } = await db.query(`${SELECT_LANCAMENTO} WHERE l.id = $1 AND l.unidade = $2`, [
    id,
    usuario.unidade,
  ]);
  if (!rows[0]) throw erro(404, 'Lançamento não encontrado.');
  const l = formatar(rows[0]);
  const b = await db.query(
    `SELECT b.id, b.valor, b.data::text AS data, b.forma, u.nome AS usuario_nome
       FROM lancamento_baixas b LEFT JOIN usuarios u ON u.id = b.usuario_id
      WHERE b.lancamento_id = $1 ORDER BY b.em`,
    [id],
  );
  l.baixas = b.rows.map((x) => ({ ...x, valor: Number(x.valor) }));
  return l;
}

async function listar(f, usuario) {
  const cond = ['l.unidade = $1'];
  const val = [usuario.unidade];
  const add = (sql, v) => {
    val.push(v);
    cond.push(sql.replace(/\?/g, `$${val.length}`));
  };
  if (f.tipo) add('l.tipo = ?', f.tipo);
  if (f.situacao === 'em_aberto') cond.push("l.situacao IN ('aberto','parcial')");
  else if (f.situacao) add('l.situacao = ?', f.situacao);
  else cond.push("l.situacao <> 'cancelado'");
  if (f.categoria) add('l.categoria_id = ?', f.categoria);
  if (f.cliente) add('l.cliente_id = ?', f.cliente);
  // Período pela data que importa: a do pagamento, se já quitado; senão, o vencimento.
  if (f.inicio) add('COALESCE(l.pagamento, l.vencimento) >= ?', f.inicio);
  if (f.fim) add('COALESCE(l.pagamento, l.vencimento) <= ?', f.fim);
  const { rows } = await query(
    `${SELECT_LANCAMENTO} WHERE ${cond.join(' AND ')}
      ORDER BY COALESCE(l.pagamento, l.vencimento) DESC, l.criado_em DESC LIMIT 500`,
    val,
  );
  return rows.map(formatar);
}

async function conferirVinculos(db, d, usuario, categoria) {
  if (!categoria) throw erro(400, 'Categoria não encontrada.');
  if (categoria.tipo !== d.tipo)
    throw erro(400, 'A categoria não corresponde ao tipo do lançamento.');
  if (d.paciente_id) {
    if (usuario.unidade !== 'clinica')
      throw erro(400, 'Paciente só existe no financeiro da clínica.');
    const p = await db.query('SELECT 1 FROM pacientes WHERE id = $1', [d.paciente_id]);
    if (!p.rows[0]) throw erro(400, 'Paciente não encontrado.');
  }
  if (d.cliente_id) {
    if (usuario.unidade !== 'laboratorio') {
      throw erro(400, 'Cliente só existe no financeiro do laboratório.');
    }
    const c = await db.query('SELECT 1 FROM laboratorio_clientes WHERE id = $1', [d.cliente_id]);
    if (!c.rows[0]) throw erro(400, 'Cliente não encontrado.');
  }
}

const somarMeses = (data, n) => `($${data}::date + make_interval(months => ${n}))::date`;

/**
 * Cria o lançamento. `parcelas` divide o valor em N títulos mensais (a diferença de centavos fica na
 * primeira); `repeticoes` com recorrência mensal repete o valor cheio por N meses.
 * `baixa` (forma, data) já registra o recebimento/pagamento do primeiro título.
 */
async function criar(d, usuario) {
  const parcelas = d.parcelas || 1;
  const repeticoes = d.recorrencia === 'mensal' ? d.repeticoes || 12 : 1;
  if (parcelas > 1 && repeticoes > 1) {
    throw erro(400, 'Escolha parcelamento ou recorrência, não os dois.');
  }
  const quantidade = Math.max(parcelas, repeticoes);
  try {
    return await comTransacao(async (db) => {
      const cat = await db.query(
        'SELECT tipo FROM categorias_financeiras WHERE id = $1 AND unidade = $2 AND ativo',
        [d.categoria_id, usuario.unidade],
      );
      await conferirVinculos(db, d, usuario, cat.rows[0]);
      const total = centavos(d.valor);
      const base = parcelas > 1 ? Math.floor(total / parcelas) : total;
      const grupo = quantidade > 1 ? crypto.randomUUID() : null;
      const ids = [];
      for (let i = 0; i < quantidade; i += 1) {
        const valor = parcelas > 1 && i === 0 ? total - base * (parcelas - 1) : base;
        const { rows } = await db.query(
          `INSERT INTO lancamentos (unidade, tipo, categoria_id, descricao, valor, vencimento, forma,
             paciente_id, cliente_id, grupo_id, parcela, parcelas, recorrencia, criado_por)
           VALUES ($1,$2,$3,$4,$5, ${somarMeses(6, i)}, $7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
          [
            usuario.unidade,
            d.tipo,
            d.categoria_id,
            d.descricao,
            reais(valor).toFixed(2),
            d.vencimento,
            d.forma || null,
            d.paciente_id || null,
            d.cliente_id || null,
            grupo,
            parcelas > 1 ? i + 1 : null,
            parcelas > 1 ? parcelas : null,
            repeticoes > 1 ? 'mensal' : null,
            usuario.id,
          ],
        );
        ids.push(rows[0].id);
      }
      if (d.baixa) {
        const primeiro = await buscar(ids[0], usuario, db);
        await db.query(
          `INSERT INTO lancamento_baixas (lancamento_id, valor, data, forma, usuario_id)
           VALUES ($1, $2, COALESCE($3::date, ${HOJE}), $4, $5)`,
          [ids[0], primeiro.valor.toFixed(2), d.baixa.data || null, d.baixa.forma, usuario.id],
        );
      }
      const criados = [];
      for (const id of ids) criados.push(await buscar(id, usuario, db));
      return criados;
    });
  } catch (err) {
    throw traduzirErroBanco(err);
  }
}

async function editar(id, d, usuario) {
  const antes = await buscar(id, usuario);
  if (antes.situacao === 'cancelado')
    throw erro(409, 'Lançamento cancelado não pode ser alterado.');
  // Com dinheiro já movimentado, valor e vencimento não mudam mais.
  if (antes.valor_pago > 0 && ('valor' in d || 'vencimento' in d)) {
    throw erro(409, 'Este lançamento já tem baixa: valor e vencimento não podem mudar.');
  }
  if (d.categoria_id) {
    const cat = await query(
      'SELECT tipo FROM categorias_financeiras WHERE id = $1 AND unidade = $2 AND ativo',
      [d.categoria_id, usuario.unidade],
    );
    if (!cat.rows[0] || cat.rows[0].tipo !== antes.tipo) {
      throw erro(400, 'A categoria não corresponde ao tipo do lançamento.');
    }
  }
  const campos = ['descricao', 'categoria_id', 'valor', 'vencimento', 'forma'].filter(
    (k) => k in d,
  );
  await query(
    `UPDATE lancamentos SET ${campos.map((k, i) => `${k} = $${i + 2}`).join(', ')}, atualizado_em = now()
      WHERE id = $1`,
    [id, ...campos.map((k) => (k === 'valor' ? Number(d[k]).toFixed(2) : d[k] || null))],
  );
  return { antes, depois: await buscar(id, usuario) };
}

/** Baixa total ou parcial. O trigger confere o saldo, atualiza a situação e barra dia de caixa fechado. */
async function darBaixa(id, d, usuario) {
  const antes = await buscar(id, usuario);
  if (antes.situacao === 'cancelado') throw erro(409, 'Lançamento cancelado não recebe baixa.');
  if (antes.situacao === 'pago') throw erro(409, 'Este lançamento já está quitado.');
  const valor = d.valor ?? antes.saldo;
  if (centavos(valor) > centavos(antes.saldo)) {
    throw erro(409, 'A baixa é maior que o saldo em aberto.');
  }
  try {
    const data = await query(`SELECT COALESCE($1::date, ${HOJE}) > ${HOJE} AS futura`, [
      d.data || null,
    ]);
    if (data.rows[0].futura) throw erro(400, 'A data da baixa não pode estar no futuro.');
    await query(
      `INSERT INTO lancamento_baixas (lancamento_id, valor, data, forma, usuario_id)
       VALUES ($1, $2, COALESCE($3::date, ${HOJE}), $4, $5)`,
      [id, Number(valor).toFixed(2), d.data || null, d.forma, usuario.id],
    );
  } catch (err) {
    throw traduzirErroBanco(err);
  }
  return { antes, depois: await buscar(id, usuario) };
}

async function cancelar(id, motivo, usuario) {
  const antes = await buscar(id, usuario);
  if (antes.situacao === 'cancelado') throw erro(409, 'Este lançamento já está cancelado.');
  if (antes.valor_pago > 0) {
    throw erro(409, 'Lançamento com baixa não pode ser cancelado.');
  }
  await query(
    "UPDATE lancamentos SET situacao = 'cancelado', motivo_cancelamento = $2, atualizado_em = now() WHERE id = $1",
    [id, motivo],
  );
  return { antes, depois: await buscar(id, usuario) };
}

async function emAberto(tipo, usuario) {
  const itens = await listar({ tipo, situacao: 'em_aberto' }, usuario);
  itens.sort((a, b) => a.vencimento.localeCompare(b.vencimento));
  const total = reais(itens.reduce((n, l) => n + centavos(l.saldo), 0));
  const atrasado = reais(
    itens.filter((l) => l.atrasado).reduce((n, l) => n + centavos(l.saldo), 0),
  );
  return { total, atrasado, itens };
}

/* ------------------------------ fluxo de caixa ------------------------------ */

/**
 * Realizado = baixas com data no período. Em aberto = saldo dos títulos que vencem no período.
 * Previsto = realizado + em aberto. As semanas dividem o período em blocos de 7 dias.
 */
async function fluxoDeCaixa({ inicio, fim }, usuario) {
  const baixas = await query(
    `SELECT l.tipo, b.data::text AS data, sum(b.valor) AS valor
       FROM lancamento_baixas b JOIN lancamentos l ON l.id = b.lancamento_id
      WHERE l.unidade = $1 AND b.data BETWEEN $2 AND $3 GROUP BY l.tipo, b.data`,
    [usuario.unidade, inicio, fim],
  );
  const abertos = await query(
    `SELECT tipo, vencimento::text AS data, sum(valor - valor_pago) AS valor
       FROM lancamentos
      WHERE unidade = $1 AND situacao IN ('aberto','parcial') AND vencimento BETWEEN $2 AND $3
      GROUP BY tipo, vencimento`,
    [usuario.unidade, inicio, fim],
  );
  const semanas = [];
  const dia = (s) => new Date(`${s}T12:00:00Z`);
  for (let d = dia(inicio); d <= dia(fim); d.setUTCDate(d.getUTCDate() + 7)) {
    const ini = d.toISOString().slice(0, 10);
    const f = new Date(d);
    f.setUTCDate(f.getUTCDate() + 6);
    const ate = f > dia(fim) ? fim : f.toISOString().slice(0, 10);
    semanas.push({ inicio: ini, fim: ate, receitas: 0, despesas: 0, a_receber: 0, a_pagar: 0 });
  }
  const somar = (linhas, campoReceita, campoDespesa) => {
    for (const r of linhas) {
      const s = semanas.find((x) => r.data >= x.inicio && r.data <= x.fim);
      if (s) s[r.tipo === 'receita' ? campoReceita : campoDespesa] += centavos(r.valor);
    }
  };
  somar(baixas.rows, 'receitas', 'despesas');
  somar(abertos.rows, 'a_receber', 'a_pagar');
  const total = (k) => semanas.reduce((n, s) => n + s[k], 0);
  const [rec, desp, aRec, aPag] = ['receitas', 'despesas', 'a_receber', 'a_pagar'].map(total);
  return {
    inicio,
    fim,
    receitas: { realizado: reais(rec), em_aberto: reais(aRec), previsto: reais(rec + aRec) },
    despesas: { realizado: reais(desp), em_aberto: reais(aPag), previsto: reais(desp + aPag) },
    saldo: { realizado: reais(rec - desp), previsto: reais(rec + aRec - desp - aPag) },
    semanas: semanas.map((s) => ({
      inicio: s.inicio,
      fim: s.fim,
      receitas: reais(s.receitas),
      despesas: reais(s.despesas),
      a_receber: reais(s.a_receber),
      a_pagar: reais(s.a_pagar),
    })),
  };
}

/* ------------------------------ caixa do dia (clínica) ------------------------------ */

async function totaisDoDia(db, unidade, data) {
  const { rows } = await db.query(
    `SELECT l.tipo, b.forma, sum(b.valor) AS valor, count(*)::int AS n
       FROM lancamento_baixas b JOIN lancamentos l ON l.id = b.lancamento_id
      WHERE l.unidade = $1 AND b.data = $2 GROUP BY l.tipo, b.forma`,
    [unidade, data],
  );
  const porForma = Object.fromEntries(FORMAS.map((f) => [f, 0]));
  let entradas = 0;
  let saidas = 0;
  let movimentos = 0;
  for (const r of rows) {
    movimentos += r.n;
    if (r.tipo === 'receita') {
      porForma[r.forma] += centavos(r.valor);
      entradas += centavos(r.valor);
    } else saidas += centavos(r.valor);
  }
  return {
    por_forma: Object.fromEntries(Object.entries(porForma).map(([k, v]) => [k, reais(v)])),
    entradas: reais(entradas),
    saidas: reais(saidas),
    saldo: reais(entradas - saidas),
    movimentos,
  };
}

async function caixaDoDia(usuario, data, db = { query }) {
  const d = await db.query(`SELECT COALESCE($1::date, ${HOJE})::text AS data`, [data || null]);
  const dia = d.rows[0].data;
  const { rows } = await db.query(
    `SELECT c.id, c.totais, c.fechado_em, c.reaberto_em, c.justificativa,
            uf.nome AS fechado_por, ur.nome AS reaberto_por
       FROM caixas_diarios c
       LEFT JOIN usuarios uf ON uf.id = c.fechado_por
       LEFT JOIN usuarios ur ON ur.id = c.reaberto_por
      WHERE c.unidade = $1 AND c.data = $2`,
    [usuario.unidade, dia],
  );
  const c = rows[0];
  const fechado = Boolean(c && !c.reaberto_em);
  return {
    id: c?.id ?? null,
    data: dia,
    situacao: fechado ? 'fechado' : 'aberto',
    // Fechado: vale a fotografia do fechamento. Aberto: soma ao vivo das baixas do dia.
    totais: fechado ? c.totais : await totaisDoDia(db, usuario.unidade, dia),
    fechado_em: fechado ? c.fechado_em : null,
    fechado_por: fechado ? c.fechado_por : null,
    reaberto_em: c?.reaberto_em ?? null,
    reaberto_por: c?.reaberto_por ?? null,
    justificativa: c?.justificativa ?? null,
  };
}

async function fecharCaixa(usuario, data) {
  return comTransacao(async (db) => {
    const atual = await caixaDoDia(usuario, data, db);
    if (atual.situacao === 'fechado') throw erro(409, 'O caixa deste dia já está fechado.');
    const futuro = await db.query(`SELECT $1::date > ${HOJE} AS futuro`, [atual.data]);
    if (futuro.rows[0].futuro) throw erro(400, 'Não é possível fechar o caixa de um dia futuro.');
    await db.query(
      `INSERT INTO caixas_diarios (unidade, data, totais, fechado_por) VALUES ($1,$2,$3,$4)
       ON CONFLICT (unidade, data) DO UPDATE
         SET totais = EXCLUDED.totais, fechado_em = now(), fechado_por = EXCLUDED.fechado_por,
             reaberto_em = NULL, reaberto_por = NULL, atualizado_em = now()`,
      [usuario.unidade, atual.data, JSON.stringify(atual.totais), usuario.id],
    );
    return caixaDoDia(usuario, atual.data, db);
  });
}

/** RN-011 — só a reabertura justificada libera novas baixas no dia. */
async function reabrirCaixa(id, justificativa, usuario) {
  const { rows } = await query(
    `UPDATE caixas_diarios SET reaberto_em = now(), reaberto_por = $3, justificativa = $4, atualizado_em = now()
      WHERE id = $1 AND unidade = $2 AND reaberto_em IS NULL RETURNING data::text AS data`,
    [id, usuario.unidade, usuario.id, justificativa],
  );
  if (!rows[0]) {
    const existe = await query('SELECT 1 FROM caixas_diarios WHERE id = $1 AND unidade = $2', [
      id,
      usuario.unidade,
    ]);
    if (!existe.rows[0]) throw erro(404, 'Fechamento de caixa não encontrado.');
    throw erro(409, 'Este caixa já está aberto.');
  }
  return caixaDoDia(usuario, rows[0].data);
}

async function fechamentos(usuario) {
  const { rows } = await query(
    `SELECT c.id, c.data::text AS data, c.totais, c.fechado_em, c.reaberto_em, c.justificativa,
            uf.nome AS fechado_por, ur.nome AS reaberto_por
       FROM caixas_diarios c
       LEFT JOIN usuarios uf ON uf.id = c.fechado_por
       LEFT JOIN usuarios ur ON ur.id = c.reaberto_por
      WHERE c.unidade = $1 ORDER BY c.data DESC LIMIT 60`,
    [usuario.unidade],
  );
  return rows.map((c) => ({ ...c, situacao: c.reaberto_em ? 'aberto' : 'fechado' }));
}

/* ------------------------------ laboratório: a receber por cliente e extrato ------------------------------ */

async function aReceberPorCliente(usuario, { inicio, fim }) {
  const { rows } = await query(
    `SELECT c.id, c.razao_social AS nome, c.tipo,
            sum(l.valor) AS faturado, sum(l.valor_pago) AS recebido,
            sum(l.valor - l.valor_pago) FILTER (WHERE l.situacao IN ('aberto','parcial')) AS a_receber,
            min(l.vencimento) FILTER (WHERE l.situacao IN ('aberto','parcial'))::text AS vencimento
       FROM lancamentos l JOIN laboratorio_clientes c ON c.id = l.cliente_id
      WHERE l.unidade = $1 AND l.tipo = 'receita' AND l.situacao <> 'cancelado'
        AND l.vencimento BETWEEN $2 AND $3
      GROUP BY c.id ORDER BY (c.tipo = 'interno') DESC, c.razao_social`,
    [usuario.unidade, inicio, fim],
  );
  return rows.map((r) => ({
    id: r.id,
    nome: r.nome,
    tipo: r.tipo,
    faturado: Number(r.faturado),
    recebido: Number(r.recebido),
    a_receber: Number(r.a_receber || 0),
    vencimento: r.vencimento,
  }));
}

/** Extrato mensal de um cliente do laboratório: OS concluídas no mês, resumo por tipo e pagamento. */
async function extrato(clienteId, mes) {
  const c = await query(
    `SELECT id, tipo, razao_social, documento_tipo, documento_cifrado, responsavel, cro, endereco
       FROM laboratorio_clientes WHERE id = $1`,
    [clienteId],
  );
  if (!c.rows[0]) throw erro(404, 'Cliente não encontrado.');
  const cli = c.rows[0];
  const p = await query(
    `SELECT to_char(d, 'YYYY-MM-DD') AS inicio,
            to_char(d + interval '1 month' - interval '1 day', 'YYYY-MM-DD') AS fim
       FROM (SELECT COALESCE($1::date, date_trunc('month', ${HOJE}::timestamp)::date) AS d) x`,
    [mes ? `${mes}-01` : null],
  );
  const { inicio, fim } = p.rows[0];
  const { rows } = await query(
    `SELECT o.id, o.numero, o.tipo_trabalho, o.elementos, o.valor,
            (o.concluida_em AT TIME ZONE 'America/Sao_Paulo')::date::text AS data,
            COALESCE(pc.nome, o.paciente_nome) AS paciente
       FROM ordens_servico o LEFT JOIN pacientes pc ON pc.id = o.paciente_id
      WHERE o.cliente_id = $1 AND o.status = 'concluida'
        AND (o.concluida_em AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $2 AND $3
      ORDER BY o.concluida_em, o.numero`,
    [clienteId, inicio, fim],
  );
  const itens = rows.map((o) => ({ ...o, valor: o.valor === null ? null : Number(o.valor) }));
  const porTipo = new Map();
  for (const o of itens) {
    const r = porTipo.get(o.tipo_trabalho) || {
      tipo_trabalho: o.tipo_trabalho,
      quantidade: 0,
      total: 0,
    };
    r.quantidade += 1;
    r.total += centavos(o.valor || 0);
    porTipo.set(o.tipo_trabalho, r);
  }
  const pag = await query(
    `SELECT COALESCE(sum(l.valor_pago), 0) AS recebido,
            COALESCE(sum(l.valor - l.valor_pago) FILTER (WHERE l.situacao IN ('aberto','parcial')), 0) AS a_receber,
            min(l.vencimento) FILTER (WHERE l.situacao IN ('aberto','parcial'))::text AS vencimento
       FROM lancamentos l JOIN ordens_servico o ON o.id = l.os_id
      WHERE l.unidade = 'laboratorio' AND l.cliente_id = $1 AND l.situacao <> 'cancelado'
        AND (o.concluida_em AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $2 AND $3`,
    [clienteId, inicio, fim],
  );
  return {
    cliente: {
      id: cli.id,
      tipo: cli.tipo,
      razao_social: cli.razao_social,
      documento_tipo: cli.documento_tipo,
      documento: cli.documento_cifrado ? mascararDocumento(decifrar(cli.documento_cifrado)) : null,
      responsavel: cli.responsavel,
      cro: cli.cro,
      endereco: cli.endereco,
    },
    inicio,
    fim,
    os_concluidas: itens.length,
    total: reais(itens.reduce((n, o) => n + centavos(o.valor || 0), 0)),
    itens,
    resumo: [...porTipo.values()]
      .map((r) => ({ ...r, total: reais(r.total) }))
      .sort((a, b) => b.total - a.total),
    pagamento: {
      recebido: Number(pag.rows[0].recebido),
      a_receber: Number(pag.rows[0].a_receber),
      vencimento: pag.rows[0].vencimento,
    },
  };
}

/* ------------------------------ lançamentos automáticos (outros módulos) ------------------------------ */

/**
 * OS concluída com valor: o laboratório ganha um título a receber do cliente e, se a OS é da
 * clínica própria, a clínica ganha a conta a pagar correspondente. Os livros são separados (RN-008).
 */
async function gerarDaOs(db, os, usuarioId) {
  if (os.valor === null || Number(os.valor) <= 0) return;
  const vencimento = `(${HOJE} + ${DIAS_VENCIMENTO_OS})`;
  const titulo = `${os.numero} · ${os.tipo_trabalho}`;
  await db.query(
    `INSERT INTO lancamentos (unidade, tipo, categoria_id, descricao, valor, vencimento, cliente_id, os_id, criado_por)
     VALUES ('laboratorio', 'receita', $1, $2, $3, ${vencimento}, $4, $5, $6)
     ON CONFLICT (unidade, os_id) WHERE os_id IS NOT NULL DO NOTHING`,
    [
      await categoriaDoSistema(db, 'laboratorio', 'servicos_os'),
      `${titulo} · ${os.cliente_nome}`,
      os.valor,
      os.cliente_id,
      os.id,
      usuarioId,
    ],
  );
  if (os.origem === 'propria') {
    await db.query(
      `INSERT INTO lancamentos (unidade, tipo, categoria_id, descricao, valor, vencimento, forma, paciente_id, os_id, criado_por)
       VALUES ('clinica', 'despesa', $1, $2, $3, ${vencimento}, 'boleto', $4, $5, $6)
       ON CONFLICT (unidade, os_id) WHERE os_id IS NOT NULL DO NOTHING`,
      [
        await categoriaDoSistema(db, 'clinica', 'protese_laboratorio'),
        `${titulo} · Lab. QuickOdonto`,
        os.valor,
        os.paciente_id,
        os.id,
        usuarioId,
      ],
    );
  }
}

/** Plano de tratamento aprovado vira conta a receber da clínica (um título pelo total). */
async function gerarDoPlano(db, plano, usuarioId) {
  if (!(plano.total > 0)) return;
  await db.query(
    `INSERT INTO lancamentos (unidade, tipo, categoria_id, descricao, valor, vencimento, paciente_id, plano_id, criado_por)
     VALUES ('clinica', 'receita', $1, $2, $3, ${HOJE}, $4, $5, $6)
     ON CONFLICT (plano_id) WHERE plano_id IS NOT NULL AND parcela IS NULL DO NOTHING`,
    [
      await categoriaDoSistema(db, 'clinica', 'tratamento'),
      `Plano de tratamento · ${plano.paciente_nome}`,
      plano.total.toFixed(2),
      plano.paciente_id,
      plano.id,
      usuarioId,
    ],
  );
}

/** Entrada de estoque lançada como compra a pagar (opção da tela de entrada). */
async function gerarDaCompra(db, { unidade, descricao, valor, fornecedor }, usuarioId) {
  if (!(valor > 0)) return;
  await db.query(
    `INSERT INTO lancamentos (unidade, tipo, categoria_id, descricao, valor, vencimento, forma, criado_por)
     VALUES ($1, 'despesa', $2, $3, $4, ${HOJE} + 30, 'boleto', $5)`,
    [
      unidade,
      await categoriaDoSistema(db, unidade, 'estoque'),
      `${fornecedor || 'Compra'} · ${descricao}`,
      valor.toFixed(2),
      usuarioId,
    ],
  );
}

module.exports = {
  FORMAS,
  erro,
  listarCategorias,
  criarCategoria,
  buscar,
  listar,
  criar,
  editar,
  darBaixa,
  cancelar,
  emAberto,
  fluxoDeCaixa,
  caixaDoDia,
  fecharCaixa,
  reabrirCaixa,
  fechamentos,
  aReceberPorCliente,
  extrato,
  gerarDaOs,
  gerarDoPlano,
  gerarDaCompra,
};
