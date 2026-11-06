const { pool, query } = require('../../config/db');
const { notificar } = require('../notificacoes/notificacoes.routes');
const { permissoesDoPerfil } = require('../auth/auth.service');
const financeiro = require('../financeiro/financeiro.service');

const HOJE = "(now() AT TIME ZONE 'America/Sao_Paulo')::date";
const INICIO_DO_DIA = `(${HOJE}::timestamp AT TIME ZONE 'America/Sao_Paulo')`;
const INICIO_DO_MES = `(date_trunc('month', ${HOJE}::timestamp) AT TIME ZONE 'America/Sao_Paulo')`;
const DIAS_VALIDADE = 30;
const SEM_LOTE = 'S/L';

function erro(status, mensagem) {
  return Object.assign(new Error(mensagem), { status });
}

/** RN-007 — custo e valor de estoque são informação financeira: só a administração vê. */
const veCusto = (usuario) => usuario.perfil !== 'laboratorio';

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

/* ------------------------------ produtos ------------------------------ */

const SELECT_PRODUTO = `
  SELECT p.id, p.nome, p.codigo, p.categoria, p.unidade_medida, p.estoque_minimo, p.fornecedor,
         p.custo_medio, p.ativo,
         COALESCE(sum(l.saldo), 0) AS saldo,
         (min(l.validade) FILTER (WHERE l.saldo > 0) - ${HOJE}) AS dias_validade,
         COALESCE(json_agg(json_build_object('id', l.id, 'lote', l.lote, 'validade', l.validade, 'saldo', l.saldo)
                           ORDER BY l.validade NULLS LAST, l.criado_em)
                  FILTER (WHERE l.id IS NOT NULL), '[]') AS lotes
    FROM produtos p LEFT JOIN lotes l ON l.produto_id = p.id`;

const ORDEM_SITUACAO = { abaixo_minimo: 0, vencido: 1, vencendo: 2, normal: 3 };

function situacao(saldo, minimo, diasValidade) {
  if (saldo < minimo) return 'abaixo_minimo';
  if (diasValidade !== null && diasValidade < 0) return 'vencido';
  if (diasValidade !== null && diasValidade <= DIAS_VALIDADE) return 'vencendo';
  return 'normal';
}

function formatarProduto(r, usuario) {
  const saldo = Number(r.saldo);
  const minimo = Number(r.estoque_minimo);
  const lotes = r.lotes.map((l) => ({ ...l, saldo: Number(l.saldo) }));
  const p = {
    id: r.id,
    nome: r.nome,
    codigo: r.codigo,
    categoria: r.categoria,
    unidade_medida: r.unidade_medida,
    estoque_minimo: minimo,
    fornecedor: r.fornecedor,
    ativo: r.ativo,
    saldo,
    situacao: situacao(saldo, minimo, r.dias_validade),
    proxima_validade: lotes.find((l) => l.saldo > 0 && l.validade)?.validade ?? null,
    lotes,
  };
  if (veCusto(usuario)) {
    p.custo_medio = Number(r.custo_medio);
    p.valor = Math.round(saldo * Number(r.custo_medio) * 100) / 100;
  }
  return p;
}

/** RN-008/RN-014 — a unidade vem sempre do usuário logado, nunca de parâmetro. */
async function listarProdutos(usuario, { ativo = 'true' } = {}) {
  const { rows } = await query(
    `${SELECT_PRODUTO} WHERE p.unidade = $1 ${ativo === 'todos' ? '' : 'AND p.ativo = $2'}
      GROUP BY p.id`,
    ativo === 'todos' ? [usuario.unidade] : [usuario.unidade, ativo === 'true'],
  );
  return rows
    .map((r) => formatarProduto(r, usuario))
    .sort(
      (a, b) =>
        ORDEM_SITUACAO[a.situacao] - ORDEM_SITUACAO[b.situacao] ||
        a.nome.localeCompare(b.nome, 'pt-BR'),
    );
}

async function buscarProduto(id, usuario, db = { query }) {
  const { rows } = await db.query(
    `${SELECT_PRODUTO} WHERE p.id = $1 AND p.unidade = $2 GROUP BY p.id`,
    [id, usuario.unidade],
  );
  // Produto de outra unidade responde como inexistente (não revela que existe).
  if (!rows[0]) throw erro(404, 'Produto não encontrado.');
  return formatarProduto(rows[0], usuario);
}

function traduzirErroBanco(err) {
  if (err.code === '23505' && /produtos_unidade_codigo/.test(err.constraint || '')) {
    return erro(409, 'Já existe um produto com este código nesta unidade.');
  }
  if (err.code === '23514' && /lotes_saldo_rn005/.test(err.constraint || '')) {
    return erro(409, 'Saldo insuficiente para esta retirada.');
  }
  return err;
}

async function criarProduto(d, usuario) {
  try {
    const { rows } = await query(
      `INSERT INTO produtos (unidade, nome, codigo, categoria, unidade_medida, estoque_minimo, fornecedor)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [
        usuario.unidade,
        d.nome,
        d.codigo,
        d.categoria || null,
        d.unidade_medida,
        d.estoque_minimo ?? 0,
        d.fornecedor || null,
      ],
    );
    return buscarProduto(rows[0].id, usuario);
  } catch (err) {
    throw traduzirErroBanco(err);
  }
}

const CAMPOS_PRODUTO = [
  'nome',
  'codigo',
  'categoria',
  'unidade_medida',
  'estoque_minimo',
  'fornecedor',
  'ativo',
];

async function atualizarProduto(id, d, usuario) {
  const antes = await buscarProduto(id, usuario);
  const campos = CAMPOS_PRODUTO.filter((k) => k in d);
  if (d.ativo === false && antes.saldo > 0) {
    throw erro(409, 'Produto com saldo não pode ser inativado: zere o estoque antes.');
  }
  try {
    await query(
      `UPDATE produtos SET ${campos.map((k, i) => `${k} = $${i + 2}`).join(', ')}, atualizado_em = now()
        WHERE id = $1`,
      [id, ...campos.map((k) => (d[k] === '' ? null : d[k]))],
    );
  } catch (err) {
    throw traduzirErroBanco(err);
  }
  return { antes, depois: await buscarProduto(id, usuario) };
}

/* ------------------------------ movimentações ------------------------------ */

async function produtoParaMovimentar(db, id, usuario) {
  const { rows } = await db.query(
    `SELECT id, nome, unidade_medida, estoque_minimo, custo_medio, ativo FROM produtos
      WHERE id = $1 AND unidade = $2 FOR UPDATE`,
    [id, usuario.unidade],
  );
  if (!rows[0]) throw erro(404, 'Produto não encontrado.');
  if (!rows[0].ativo) throw erro(409, 'Produto inativo não recebe movimentação.');
  const s = await db.query(
    'SELECT COALESCE(sum(saldo), 0) AS saldo FROM lotes WHERE produto_id = $1',
    [id],
  );
  return { ...rows[0], saldo: Number(s.rows[0].saldo), minimo: Number(rows[0].estoque_minimo) };
}

async function gravar(db, m) {
  await db.query(
    `INSERT INTO estoque_movimentacoes (produto_id, lote_id, tipo, quantidade, saldo_apos, custo, os_id,
       motivo, justificativa, fornecedor, nota_fiscal, usuario_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      m.produto_id,
      m.lote_id,
      m.tipo,
      m.quantidade,
      m.saldo_apos,
      m.custo,
      m.os_id || null,
      m.motivo || null,
      m.justificativa || null,
      m.fornecedor || null,
      m.nota_fiscal || null,
      m.usuario_id,
    ],
  );
}

/** Avisa a administração da unidade quando o produto cruza o mínimo para baixo. */
async function avisarMinimo(produto, saldoDepois, usuario) {
  if (!(produto.saldo >= produto.minimo && saldoDepois < produto.minimo)) return;
  const perfil = usuario.unidade === 'clinica' ? 'adm_clinica' : 'adm_laboratorio';
  const { rows } = await query("SELECT id FROM usuarios WHERE perfil = $1 AND status = 'ativo'", [
    perfil,
  ]);
  const link = usuario.unidade === 'clinica' ? '/admin/clinica/estoque' : '/admin/lab/estoque';
  await Promise.all(
    rows.map((u) =>
      notificar(u.id, {
        tipo: 'estoque',
        titulo: `Estoque: ${produto.nome} abaixo do mínimo`,
        link,
      }),
    ),
  );
}

async function entrada(d, usuario) {
  if (usuario.perfil === 'laboratorio') {
    const p = await permissoesDoPerfil('laboratorio');
    if (p.entrada_estoque !== true) {
      throw erro(403, 'Seu perfil não está autorizado a registrar entrada de estoque.');
    }
  }
  return comTransacao(async (db) => {
    const produto = await produtoParaMovimentar(db, d.produto_id, usuario);
    const nomeLote = d.lote || SEM_LOTE;
    const lote = await db.query(
      `INSERT INTO lotes (produto_id, lote, validade, saldo) VALUES ($1,$2,$3,$4)
       ON CONFLICT (produto_id, lote) DO UPDATE
         SET saldo = lotes.saldo + EXCLUDED.saldo,
             validade = COALESCE(EXCLUDED.validade, lotes.validade), atualizado_em = now()
       RETURNING id, saldo`,
      [produto.id, nomeLote, d.validade || null, d.quantidade],
    );
    // Custo médio ponderado pelo saldo que já existia.
    const total = produto.saldo + d.quantidade;
    const custoMedio =
      (produto.saldo * Number(produto.custo_medio) + d.quantidade * d.custo_unitario) / total;
    await db.query(
      `UPDATE produtos SET custo_medio = $2, fornecedor = COALESCE($3, fornecedor), atualizado_em = now()
        WHERE id = $1`,
      [produto.id, custoMedio.toFixed(4), d.fornecedor || null],
    );
    await gravar(db, {
      produto_id: produto.id,
      lote_id: lote.rows[0].id,
      tipo: 'entrada',
      quantidade: d.quantidade,
      saldo_apos: lote.rows[0].saldo,
      custo: d.custo_unitario,
      fornecedor: d.fornecedor,
      nota_fiscal: d.nota_fiscal,
      usuario_id: usuario.id,
    });
    if (d.lancar_financeiro) {
      // Só a administração lança a compra no financeiro (RN-007).
      if (!veCusto(usuario)) throw erro(403, 'Só a administração lança a compra no financeiro.');
      await financeiro.gerarDaCompra(
        db,
        {
          unidade: usuario.unidade,
          descricao: produto.nome,
          valor: Math.round(d.quantidade * d.custo_unitario * 100) / 100,
          fornecedor: d.fornecedor,
        },
        usuario.id,
      );
    }
    return buscarProduto(produto.id, usuario, db);
  });
}

/**
 * Retirada. Sem lote informado, sai primeiro do lote que vence antes (FEFO), podendo usar mais de um.
 * RN-005: se o saldo não cobre a quantidade, nada é retirado.
 */
async function retirada(d, usuario) {
  let antes;
  const depois = await comTransacao(async (db) => {
    const produto = await produtoParaMovimentar(db, d.produto_id, usuario);
    antes = produto;
    if (d.os_id) {
      if (usuario.unidade !== 'laboratorio') {
        throw erro(400, 'Só o laboratório vincula retirada a ordem de serviço.');
      }
      const os = await db.query(
        "SELECT 1 FROM ordens_servico WHERE id = $1 AND status = 'aberta' AND etapa_producao IS NOT NULL",
        [d.os_id],
      );
      if (!os.rows[0]) throw erro(400, 'Ordem de serviço não encontrada ou já fechada.');
    }
    const { rows: lotes } = await db.query(
      `SELECT id, saldo FROM lotes WHERE produto_id = $1 AND saldo > 0 ${d.lote_id ? 'AND id = $2' : ''}
        ORDER BY validade NULLS LAST, criado_em FOR UPDATE`,
      d.lote_id ? [produto.id, d.lote_id] : [produto.id],
    );
    const disponivel = lotes.reduce((n, l) => n + Number(l.saldo), 0);
    if (disponivel < d.quantidade) {
      throw erro(
        409,
        `Saldo insuficiente: há ${disponivel} ${produto.unidade_medida} ${d.lote_id ? 'neste lote' : 'em estoque'}.`,
      );
    }
    let falta = d.quantidade;
    try {
      for (const l of lotes) {
        if (falta <= 0) break;
        const q = Math.min(falta, Number(l.saldo));
        const r = await db.query(
          'UPDATE lotes SET saldo = saldo - $2, atualizado_em = now() WHERE id = $1 RETURNING saldo',
          [l.id, q],
        );
        await gravar(db, {
          produto_id: produto.id,
          lote_id: l.id,
          tipo: 'retirada',
          quantidade: q,
          saldo_apos: r.rows[0].saldo,
          custo: produto.custo_medio,
          os_id: d.os_id,
          motivo: d.motivo,
          justificativa: d.observacao,
          usuario_id: usuario.id,
        });
        falta = Math.round((falta - q) * 1000) / 1000;
      }
    } catch (err) {
      throw traduzirErroBanco(err);
    }
    return buscarProduto(produto.id, usuario, db);
  });
  await avisarMinimo(antes, depois.saldo, usuario);
  return depois;
}

/** Inventário: o saldo contado substitui o do lote; a diferença fica registrada com justificativa. */
async function ajuste(d, usuario) {
  let antes;
  const depois = await comTransacao(async (db) => {
    const produto = await produtoParaMovimentar(db, d.produto_id, usuario);
    antes = produto;
    const { rows } = await db.query(
      'SELECT id, saldo FROM lotes WHERE id = $1 AND produto_id = $2 FOR UPDATE',
      [d.lote_id, produto.id],
    );
    if (!rows[0]) throw erro(404, 'Lote não encontrado.');
    const diferenca = Math.round((d.saldo_contado - Number(rows[0].saldo)) * 1000) / 1000;
    if (diferenca === 0) throw erro(409, 'O saldo contado é igual ao saldo do sistema.');
    await db.query('UPDATE lotes SET saldo = $2, atualizado_em = now() WHERE id = $1', [
      d.lote_id,
      d.saldo_contado,
    ]);
    await gravar(db, {
      produto_id: produto.id,
      lote_id: d.lote_id,
      tipo: 'ajuste',
      quantidade: diferenca,
      saldo_apos: d.saldo_contado,
      custo: produto.custo_medio,
      justificativa: d.justificativa,
      usuario_id: usuario.id,
    });
    return buscarProduto(produto.id, usuario, db);
  });
  await avisarMinimo(antes, depois.saldo, usuario);
  return depois;
}

async function movimentacoes(f, usuario) {
  const cond = ['p.unidade = $1'];
  const val = [usuario.unidade];
  const add = (sql, v) => {
    val.push(v);
    cond.push(sql.replace('?', `$${val.length}`));
  };
  if (f.tipo) add('m.tipo = ?', f.tipo);
  if (f.produto) add('m.produto_id = ?', f.produto);
  if (f.inicio) add('m.em >= ?', f.inicio);
  if (f.fim) add('m.em < ?', f.fim);
  const { rows } = await query(
    `SELECT m.id, m.tipo, m.quantidade, m.saldo_apos, m.custo, m.motivo, m.justificativa, m.fornecedor,
            m.nota_fiscal, m.em, p.id AS produto_id, p.nome AS produto_nome, p.unidade_medida,
            l.lote, u.nome AS usuario_nome, o.id AS os_id, o.numero AS os_numero
       FROM estoque_movimentacoes m
       JOIN produtos p ON p.id = m.produto_id
       JOIN lotes l ON l.id = m.lote_id
       LEFT JOIN usuarios u ON u.id = m.usuario_id
       LEFT JOIN ordens_servico o ON o.id = m.os_id
      WHERE ${cond.join(' AND ')} ORDER BY m.em DESC LIMIT 300`,
    val,
  );
  const custo = veCusto(usuario);
  return rows.map((r) => {
    const m = {
      id: r.id,
      tipo: r.tipo,
      quantidade: Number(r.quantidade),
      saldo_apos: Number(r.saldo_apos),
      motivo: r.motivo,
      justificativa: r.justificativa,
      fornecedor: r.fornecedor,
      nota_fiscal: r.nota_fiscal,
      em: r.em,
      produto: { id: r.produto_id, nome: r.produto_nome, unidade_medida: r.unidade_medida },
      lote: r.lote,
      usuario_nome: r.usuario_nome,
      os: r.os_id ? { id: r.os_id, numero: r.os_numero } : null,
    };
    if (custo) m.custo = Number(r.custo);
    return m;
  });
}

/* ------------------------------ alertas e indicadores ------------------------------ */

async function alertas(usuario) {
  const produtos = await listarProdutos(usuario);
  return {
    abaixo_minimo: produtos.filter((p) => p.situacao === 'abaixo_minimo'),
    vencendo: produtos.filter((p) => p.situacao === 'vencendo' || p.situacao === 'vencido'),
  };
}

async function resumo(usuario) {
  const produtos = await listarProdutos(usuario);
  const lotes = await query(
    `SELECT count(*)::int AS n FROM lotes l JOIN produtos p ON p.id = l.produto_id
      WHERE p.unidade = $1 AND p.ativo AND l.saldo > 0 AND l.validade <= ${HOJE} + ${DIAS_VALIDADE}`,
    [usuario.unidade],
  );
  const mov = await query(
    `SELECT count(*) FILTER (WHERE m.em >= ${INICIO_DO_DIA})::int AS retiradas_hoje,
            count(*) FILTER (WHERE m.em >= ${INICIO_DO_DIA} AND m.os_id IS NOT NULL)::int AS retiradas_hoje_os,
            COALESCE(sum(m.quantidade * m.custo) FILTER (WHERE m.em >= ${INICIO_DO_MES}), 0) AS consumo_mes,
            count(DISTINCT m.os_id) FILTER (WHERE m.em >= ${INICIO_DO_MES})::int AS os_no_mes
       FROM estoque_movimentacoes m JOIN produtos p ON p.id = m.produto_id
      WHERE p.unidade = $1 AND m.tipo = 'retirada'`,
    [usuario.unidade],
  );
  const r = {
    abaixo_minimo: produtos.filter((p) => p.situacao === 'abaixo_minimo').length,
    lotes_vencendo: lotes.rows[0].n,
    retiradas_hoje: mov.rows[0].retiradas_hoje,
    retiradas_hoje_os: mov.rows[0].retiradas_hoje_os,
  };
  if (veCusto(usuario)) {
    r.valor_estoque = Math.round(produtos.reduce((n, p) => n + p.valor, 0) * 100) / 100;
    r.consumo_mes = Math.round(Number(mov.rows[0].consumo_mes) * 100) / 100;
    r.os_no_mes = mov.rows[0].os_no_mes;
  }
  return r;
}

/** Material consumido por OS (só Adm. Laboratório): ranking do mês ou o detalhe de uma OS. */
async function custoPorOs(osId) {
  if (osId) {
    const { rows } = await query(
      `SELECT m.em, m.quantidade, m.custo, m.motivo, p.nome AS produto_nome, p.unidade_medida, u.nome AS usuario_nome
         FROM estoque_movimentacoes m JOIN produtos p ON p.id = m.produto_id
         LEFT JOIN usuarios u ON u.id = m.usuario_id
        WHERE m.os_id = $1 AND m.tipo = 'retirada' ORDER BY m.em`,
      [osId],
    );
    const itens = rows.map((r) => ({
      em: r.em,
      produto_nome: r.produto_nome,
      unidade_medida: r.unidade_medida,
      quantidade: Number(r.quantidade),
      custo: Number(r.custo),
      total: Math.round(Number(r.quantidade) * Number(r.custo) * 100) / 100,
      motivo: r.motivo,
      usuario_nome: r.usuario_nome,
    }));
    return {
      os_id: osId,
      total: Math.round(itens.reduce((n, i) => n + i.total, 0) * 100) / 100,
      itens,
    };
  }
  const { rows } = await query(
    `SELECT o.id, o.numero, o.tipo_trabalho, sum(m.quantidade * m.custo) AS total, count(*)::int AS retiradas
       FROM estoque_movimentacoes m JOIN ordens_servico o ON o.id = m.os_id
      WHERE m.tipo = 'retirada' AND m.em >= ${INICIO_DO_MES}
      GROUP BY o.id ORDER BY total DESC LIMIT 20`,
  );
  return { ranking: rows.map((r) => ({ ...r, total: Math.round(Number(r.total) * 100) / 100 })) };
}

module.exports = {
  listarProdutos,
  buscarProduto,
  criarProduto,
  atualizarProduto,
  entrada,
  retirada,
  ajuste,
  movimentacoes,
  alertas,
  resumo,
  custoPorOs,
};
