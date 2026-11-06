const { pool, query } = require('../../config/db');
const { cifrar, decifrar } = require('../../lib/crypto');
const arquivo = require('../../lib/arquivoCifrado');
const { notificar } = require('../notificacoes/notificacoes.routes');
const { permissoesDoPerfil } = require('../auth/auth.service');
const financeiro = require('../financeiro/financeiro.service');

/** Lado da clínica (quadro da Secretaria). */
const ETAPAS = ['pre_laboratorio', 'envio', 'laboratorio', 'retorno', 'concluida'];
/** Lado do laboratório (produção). */
const PRODUCAO = ['recebida', 'modelo', 'estrutura', 'prova', 'acabamento', 'pronta', 'enviada'];

const HOJE = "(now() AT TIME ZONE 'America/Sao_Paulo')::date";
const DIAS_A_VENCER = 3;

function erro(status, mensagem) {
  return Object.assign(new Error(mensagem), { status });
}

const doLaboratorio = (usuario) => usuario.unidade === 'laboratorio';

/**
 * Transação com o usuário identificado: o trigger de histórico (RN-012) lê
 * quickodonto.usuario_id e recusa mudança de etapa sem ele.
 */
async function comTransacao(usuarioId, fn, observacao) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      "SELECT set_config('quickodonto.usuario_id', $1, true), set_config('quickodonto.observacao', $2, true)",
      [usuarioId, observacao || ''],
    );
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

const SELECT_OS = `
  SELECT o.id, o.numero, o.origem, o.status, o.etapa, o.etapa_producao, o.tipo_trabalho, o.elementos,
         o.cor, o.material, o.observacoes_cifrado, o.laboratorio, o.enviado_em,
         o.previsao_entrega::text AS previsao_entrega, (o.previsao_entrega - ${HOJE}) AS dias_prazo,
         o.valor, o.motivo_cancelamento, o.concluida_em, o.cancelada_em, o.criado_em,
         o.cliente_id, c.razao_social AS cliente_nome, c.tipo AS cliente_tipo,
         o.paciente_id, COALESCE(p.nome, o.paciente_nome) AS paciente,
         o.profissional_id, COALESCE(up.nome, o.dentista_nome) AS dentista,
         o.tecnico_id, ut.nome AS tecnico_nome,
         (SELECT count(*)::int FROM os_refacoes r WHERE r.os_id = o.id) AS refacoes,
         (SELECT count(*)::int FROM os_provas pv WHERE pv.os_id = o.id) AS provas,
         EXISTS (SELECT 1 FROM os_provas pv WHERE pv.os_id = o.id AND pv.devolvida_em IS NULL) AS prova_aberta
    FROM ordens_servico o
    JOIN laboratorio_clientes c ON c.id = o.cliente_id
    LEFT JOIN pacientes p ON p.id = o.paciente_id
    LEFT JOIN profissionais pr ON pr.id = o.profissional_id
    LEFT JOIN usuarios up ON up.id = pr.usuario_id
    LEFT JOIN usuarios ut ON ut.id = o.tecnico_id`;

/** RN-004 — atrasada = previsão anterior a hoje e OS ainda aberta. */
function prazo(r) {
  if (r.status !== 'aberta') return { situacao: r.status, dias: null };
  if (r.dias_prazo === null) return { situacao: 'sem_prazo', dias: null };
  if (r.dias_prazo < 0) return { situacao: 'atrasada', dias: -r.dias_prazo };
  if (r.dias_prazo <= DIAS_A_VENCER) return { situacao: 'a_vencer', dias: r.dias_prazo };
  return { situacao: 'no_prazo', dias: r.dias_prazo };
}

/**
 * Representação por perfil: o laboratório recebe só o nome do paciente (sem vínculo com o cadastro)
 * e o valor só aparece para a administração do laboratório (RN-007).
 */
function formatar(r, usuario, { detalhe = false } = {}) {
  const lab = doLaboratorio(usuario);
  const os = {
    id: r.id,
    numero: r.numero,
    origem: r.origem,
    status: r.status,
    etapa: r.etapa,
    etapa_producao: r.etapa_producao,
    tipo_trabalho: r.tipo_trabalho,
    elementos: r.elementos,
    cor: r.cor,
    material: r.material,
    laboratorio: r.laboratorio,
    previsao_entrega: r.previsao_entrega,
    enviado_em: r.enviado_em,
    concluida_em: r.concluida_em,
    cancelada_em: r.cancelada_em,
    motivo_cancelamento: r.motivo_cancelamento,
    criado_em: r.criado_em,
    cliente: { id: r.cliente_id, nome: r.cliente_nome, tipo: r.cliente_tipo },
    paciente: { id: lab ? null : r.paciente_id, nome: r.paciente },
    dentista: r.dentista ? { id: lab ? null : r.profissional_id, nome: r.dentista } : null,
    tecnico: r.tecnico_id ? { id: r.tecnico_id, nome: r.tecnico_nome } : null,
    prazo: prazo(r),
    refacoes: r.refacoes,
    provas: r.provas,
    prova_aberta: r.prova_aberta,
  };
  if (usuario.perfil === 'adm_laboratorio') os.valor = r.valor === null ? null : Number(r.valor);
  if (detalhe) os.observacoes = r.observacoes_cifrado ? decifrar(r.observacoes_cifrado) : null;
  return os;
}

/** Versão para a trilha de auditoria: sem texto livre nem valor. */
function paraAuditoria(os) {
  const { observacoes: _o, valor: _v, prazo: _p, ...resto } = os;
  return resto;
}

/** Escopo de leitura: a clínica vê as próprias OS; o laboratório, as externas e as já enviadas. */
const escopo = (usuario) =>
  doLaboratorio(usuario) ? 'o.etapa_producao IS NOT NULL' : "o.origem = 'propria'";

async function buscar(id, usuario, { detalhe = true, db } = {}) {
  const { rows } = await (db || { query }).query(
    `${SELECT_OS} WHERE o.id = $1 AND ${escopo(usuario)}`,
    [id],
  );
  if (!rows[0]) throw erro(404, 'Ordem de serviço não encontrada.');
  return formatar(rows[0], usuario, { detalhe });
}

async function listar(f, usuario) {
  const cond = [escopo(usuario)];
  const val = [];
  const add = (sql, v) => {
    val.push(v);
    cond.push(sql.replace('?', `$${val.length}`));
  };
  if (f.status !== 'todas') add('o.status = ?', f.status);
  if (f.etapa) add(doLaboratorio(usuario) ? 'o.etapa_producao = ?' : 'o.etapa = ?', f.etapa);
  if (f.origem) add('o.origem = ?', f.origem);
  if (f.cliente) add('o.cliente_id = ?', f.cliente);
  if (f.tecnico) add('o.tecnico_id = ?', f.tecnico);
  if (f.profissional) add('o.profissional_id = ?', f.profissional);
  // Em OS concluídas o período olha a conclusão; nas demais, a criação.
  const dataRef = f.status === 'concluida' ? 'o.concluida_em' : 'o.criado_em';
  if (f.inicio) add(`${dataRef} >= ?`, f.inicio);
  if (f.fim) add(`${dataRef} < ?`, f.fim);
  const { rows } = await query(
    `${SELECT_OS} WHERE ${cond.join(' AND ')}
      ORDER BY COALESCE(o.enviado_em, o.criado_em), o.numero LIMIT 500`,
    val,
  );
  return rows.map((r) => formatar(r, usuario));
}

async function atrasadas(usuario) {
  const { rows } = await query(
    `${SELECT_OS}
      WHERE ${escopo(usuario)} AND o.status = 'aberta'
        AND o.previsao_entrega <= ${HOJE} + ${DIAS_A_VENCER}
      ORDER BY o.previsao_entrega, o.numero`,
  );
  const todas = rows.map((r) => formatar(r, usuario));
  return {
    atrasadas: todas.filter((o) => o.prazo.situacao === 'atrasada'),
    a_vencer: todas.filter((o) => o.prazo.situacao === 'a_vencer'),
  };
}

/* ------------------------------ apoio ------------------------------ */

/** A clínica própria é o cliente interno do laboratório; nasce na primeira OS. */
async function clienteInterno(db) {
  const achar = () => db.query("SELECT id FROM laboratorio_clientes WHERE tipo = 'interno'");
  let { rows } = await achar();
  if (!rows[0]) {
    await db.query(
      "INSERT INTO laboratorio_clientes (tipo, razao_social) VALUES ('interno', 'Clínica própria') ON CONFLICT DO NOTHING",
    );
    ({ rows } = await achar());
  }
  return rows[0].id;
}

/** Preço vigente: o do cliente, se houver; senão o padrão. Sem preço cadastrado, fica nulo. */
async function precoPara(db, tipoTrabalho, clienteId) {
  const { rows } = await db.query(
    `SELECT valor FROM tabela_precos
      WHERE lower(tipo_trabalho) = lower($1) AND (cliente_id = $2 OR cliente_id IS NULL)
        AND vigencia_inicio <= ${HOJE}
      ORDER BY (cliente_id IS NOT NULL) DESC, vigencia_inicio DESC LIMIT 1`,
    [tipoTrabalho, clienteId],
  );
  return rows[0] ? rows[0].valor : null;
}

async function dataPassada(db, data) {
  const { rows } = await db.query(`SELECT $1::date < ${HOJE} AS passada`, [data]);
  return rows[0].passada;
}

async function avisar(perfis, { titulo, link }, db = { query }) {
  const { rows } = await db.query(
    "SELECT id FROM usuarios WHERE perfil = ANY($1) AND status = 'ativo'",
    [perfis],
  );
  await Promise.all(rows.map((u) => notificar(u.id, { tipo: 'os', titulo, link })));
}
const avisarLaboratorio = (os, texto) =>
  avisar(['laboratorio', 'adm_laboratorio'], {
    titulo: `${os.numero}: ${texto}`,
    link: `/lab/producao?os=${os.id}`,
  });
const avisarClinica = (os, texto) =>
  avisar(['secretaria'], { titulo: `${os.numero}: ${texto}`, link: `/ordens-servico?os=${os.id}` });

async function exigirPermissao(usuario, chave, mensagem) {
  if (usuario.perfil !== 'laboratorio') return;
  const p = await permissoesDoPerfil('laboratorio');
  if (p[chave] !== true) throw erro(403, mensagem);
}

function traduzirErroBanco(err) {
  if (err.code === '23514' && /os_rn003/.test(err.constraint || '')) {
    return erro(409, 'Para enviar, a OS precisa de laboratório e data prevista de entrega.');
  }
  return err;
}

/* ------------------------------ criação e edição ------------------------------ */

async function criarPropria(d, usuario) {
  const os = await comTransacao(usuario.id, async (db) => {
    const pac = await db.query('SELECT ativo FROM pacientes WHERE id = $1', [d.paciente_id]);
    if (!pac.rows[0]) throw erro(400, 'Paciente não encontrado.');
    if (!pac.rows[0].ativo) throw erro(400, 'Paciente inativo não recebe nova OS.');

    // Quem gera a OS é o dentista, no prontuário: ele é o dentista da OS, salvo indicação de outro.
    let profissionalId = d.profissional_id || null;
    if (!profissionalId) {
      const pr = await db.query('SELECT id FROM profissionais WHERE usuario_id = $1', [usuario.id]);
      profissionalId = pr.rows[0]?.id || null;
    }
    if (profissionalId) {
      const pr = await db.query('SELECT 1 FROM profissionais WHERE id = $1 AND ativo', [
        profissionalId,
      ]);
      if (!pr.rows[0]) throw erro(400, 'Dentista não encontrado ou inativo.');
    }
    // RN-003 — a OS já nasce enviada: laboratório e data prevista são obrigatórios na criação.
    if (await dataPassada(db, d.previsao_entrega)) {
      throw erro(400, 'A previsão de entrega não pode estar no passado.');
    }
    const cliente = await clienteInterno(db);
    const { rows } = await db.query(
      `INSERT INTO ordens_servico (numero, origem, cliente_id, paciente_id, profissional_id, tipo_trabalho,
         elementos, cor, material, observacoes_cifrado, laboratorio, previsao_entrega, valor, etapa,
         etapa_producao, enviado_em, criado_por)
       VALUES ('OS-' || lpad(nextval('os_numero_propria_seq')::text, 4, '0'), 'propria', $1,$2,$3,$4,$5,$6,$7,$8,
               'proprio', $9, $10, 'envio', 'recebida', now(), $11)
       RETURNING id`,
      [
        cliente,
        d.paciente_id,
        profissionalId,
        d.tipo_trabalho,
        d.elementos || [],
        d.cor || null,
        d.material || null,
        d.observacoes ? cifrar(d.observacoes) : null,
        d.previsao_entrega,
        await precoPara(db, d.tipo_trabalho, cliente),
        usuario.id,
      ],
    );
    return buscar(rows[0].id, usuario, { db });
  });
  await avisarLaboratorio(os, 'chegou da clínica');
  return os;
}

async function criarExterna(d, usuario) {
  await exigirPermissao(
    usuario,
    'criar_os_externa',
    'Seu perfil não está autorizado a criar OS de cliente externo.',
  );
  return comTransacao(usuario.id, async (db) => {
    const c = await db.query('SELECT tipo, ativo FROM laboratorio_clientes WHERE id = $1', [
      d.cliente_id,
    ]);
    if (!c.rows[0]) throw erro(400, 'Cliente não encontrado.');
    if (c.rows[0].tipo !== 'externo') {
      throw erro(400, 'As OS da clínica própria chegam integradas; cadastre aqui só as externas.');
    }
    if (!c.rows[0].ativo) throw erro(400, 'Cliente inativo não recebe nova OS.');
    if (await dataPassada(db, d.previsao_entrega)) {
      throw erro(400, 'A previsão de entrega não pode estar no passado.');
    }
    const { rows } = await db.query(
      `INSERT INTO ordens_servico (numero, origem, cliente_id, paciente_nome, dentista_nome, tipo_trabalho,
         elementos, cor, material, observacoes_cifrado, previsao_entrega, valor, etapa_producao, enviado_em, criado_por)
       VALUES ('L-' || lpad(nextval('os_numero_externa_seq')::text, 4, '0'), 'externa', $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
               'recebida', now(), $11)
       RETURNING id`,
      [
        d.cliente_id,
        d.paciente_nome,
        d.dentista_nome || null,
        d.tipo_trabalho,
        d.elementos || [],
        d.cor || null,
        d.material || null,
        d.observacoes ? cifrar(d.observacoes) : null,
        d.previsao_entrega,
        await precoPara(db, d.tipo_trabalho, d.cliente_id),
        usuario.id,
      ],
    );
    return buscar(rows[0].id, usuario, { db });
  });
}

const CAMPOS = {
  tipo_trabalho: (v) => v,
  elementos: (v) => v,
  cor: (v) => v || null,
  material: (v) => v || null,
  observacoes: (v) => (v ? cifrar(v) : null),
  previsao_entrega: (v) => v || null,
  paciente_nome: (v) => v,
  dentista_nome: (v) => v || null,
};
const COLUNA = { observacoes: 'observacoes_cifrado' };

/** Só o laboratório edita: tudo na OS externa; na da clínica, apenas a previsão de entrega. */
async function editar(id, d, usuario) {
  return comTransacao(usuario.id, async (db) => {
    const antes = await buscar(id, usuario, { db });
    if (antes.status !== 'aberta') throw erro(409, 'Só OS em aberto pode ser alterada.');
    const campos = Object.keys(d);

    if (antes.origem === 'propria') {
      if (campos.some((k) => k !== 'previsao_entrega')) {
        throw erro(403, 'Na OS da clínica, o laboratório só ajusta a previsão de entrega.');
      }
      if (!d.previsao_entrega) throw erro(400, 'A OS enviada precisa de previsão de entrega.');
    } else if ('previsao_entrega' in d && !d.previsao_entrega) {
      throw erro(400, 'OS externa exige previsão de entrega.');
    }
    if (d.previsao_entrega && d.previsao_entrega !== antes.previsao_entrega) {
      if (await dataPassada(db, d.previsao_entrega)) {
        throw erro(400, 'A previsão de entrega não pode estar no passado.');
      }
    }
    try {
      await db.query(
        `UPDATE ordens_servico SET ${campos.map((k, i) => `${COLUNA[k] || k} = $${i + 2}`).join(', ')},
                atualizado_em = now() WHERE id = $1`,
        [id, ...campos.map((k) => CAMPOS[k](d[k]))],
      );
    } catch (err) {
      throw traduzirErroBanco(err);
    }
    return { antes, depois: await buscar(id, usuario, { db }) };
  });
}

/* ------------------------------ etapas ------------------------------ */

async function moverProducao(id, d, usuario) {
  const r = await comTransacao(
    usuario.id,
    async (db) => {
      await db.query('SELECT 1 FROM ordens_servico WHERE id = $1 FOR UPDATE', [id]);
      const antes = await buscar(id, usuario, { db });
      if (antes.status !== 'aberta') throw erro(409, 'Só OS em aberto muda de etapa.');

      // Conclusão: é do laboratório, quando a peça pronta/enviada não volta mais (sem prova pendente).
      if (d.etapa === 'entregue') {
        if (!['pronta', 'enviada'].includes(antes.etapa_producao)) {
          throw erro(409, 'Só OS pronta ou enviada pode ser concluída.');
        }
        if (antes.prova_aberta) {
          throw erro(409, 'Há uma prova na clínica: registre a devolução antes de concluir.');
        }
        await db.query(
          `UPDATE ordens_servico SET etapa_producao = 'enviada', status = 'concluida', concluida_em = now(),
                  etapa = CASE WHEN origem = 'propria' THEN 'concluida' ELSE etapa END,
                  atualizado_em = now() WHERE id = $1`,
          [id],
        );
        // OS concluída com valor gera o título a receber (e a conta a pagar da clínica, se for dela).
        const bruta = await db.query(
          `SELECT o.id, o.numero, o.tipo_trabalho, o.valor, o.origem, o.cliente_id, o.paciente_id,
                  c.razao_social AS cliente_nome
             FROM ordens_servico o JOIN laboratorio_clientes c ON c.id = o.cliente_id WHERE o.id = $1`,
          [id],
        );
        await financeiro.gerarDaOs(db, bruta.rows[0], usuario.id);
        return { antes, depois: await buscar(id, usuario, { db }) };
      }

      if (!PRODUCAO.includes(d.etapa)) throw erro(400, 'Etapa inválida.');
      if (d.etapa === antes.etapa_producao) throw erro(409, 'A OS já está nesta etapa.');
      if (antes.prova_aberta) {
        throw erro(409, 'Há uma prova na clínica: registre a devolução antes de mudar a etapa.');
      }
      if (d.etapa === 'prova') {
        await db.query(
          `INSERT INTO os_provas (os_id, numero, usuario_id)
           VALUES ($1, (SELECT count(*) + 1 FROM os_provas WHERE os_id = $1), $2)`,
          [id, usuario.id],
        );
      }
      // Reflexo no quadro da clínica: prova e envio levam a OS para "Retorno"; o resto, "Laboratório".
      let etapaClinica = antes.etapa;
      if (antes.origem === 'propria') {
        etapaClinica = ['prova', 'enviada'].includes(d.etapa) ? 'retorno' : 'laboratorio';
        if (d.etapa === 'recebida' && antes.etapa === 'envio') etapaClinica = 'envio';
      }
      await db.query(
        'UPDATE ordens_servico SET etapa_producao = $2, etapa = $3, atualizado_em = now() WHERE id = $1',
        [id, d.etapa, etapaClinica],
      );
      return { antes, depois: await buscar(id, usuario, { db }) };
    },
    d.observacao,
  );
  if (r.depois.origem === 'propria') {
    if (d.etapa === 'prova') await avisarClinica(r.depois, 'prova enviada à clínica');
    if (d.etapa === 'enviada') await avisarClinica(r.depois, 'trabalho enviado pelo laboratório');
    if (d.etapa === 'entregue') await avisarClinica(r.depois, 'concluída pelo laboratório');
  }
  return r;
}

const mover = moverProducao;

async function cancelar(id, motivo, usuario) {
  await exigirPermissao(usuario, 'cancelar_os', 'Seu perfil não está autorizado a cancelar OS.');
  const r = await comTransacao(usuario.id, async (db) => {
    const antes = await buscar(id, usuario, { db });
    if (antes.status !== 'aberta') throw erro(409, 'Só OS em aberto pode ser cancelada.');
    await db.query(
      `UPDATE ordens_servico SET status = 'cancelada', motivo_cancelamento = $2, cancelada_em = now(),
              atualizado_em = now() WHERE id = $1`,
      [id, motivo],
    );
    return { antes, depois: await buscar(id, usuario, { db }) };
  });
  if (r.depois.origem === 'propria' && r.depois.etapa_producao) {
    await avisarClinica(r.depois, 'cancelada pelo laboratório');
  }
  return r;
}

async function historico(id, usuario) {
  await buscar(id, usuario, { detalhe: false });
  const { rows } = await query(
    `SELECT h.lado, h.de_etapa, h.para_etapa, h.observacao, h.em, u.nome AS usuario_nome
       FROM os_historico h LEFT JOIN usuarios u ON u.id = h.usuario_id
      WHERE h.os_id = $1 ORDER BY h.em`,
    [id],
  );
  return rows;
}

/* ------------------------------ laboratório ------------------------------ */

async function tecnicos() {
  const { rows } = await query(
    `SELECT id, nome FROM usuarios
      WHERE unidade = 'laboratorio' AND perfil IN ('laboratorio','adm_laboratorio') AND status = 'ativo'
      ORDER BY nome`,
  );
  return rows;
}

async function atribuirTecnico(id, tecnicoId, usuario) {
  return comTransacao(usuario.id, async (db) => {
    const antes = await buscar(id, usuario, { db });
    if (antes.status !== 'aberta') throw erro(409, 'Só OS em aberto recebe técnico.');
    if (tecnicoId) {
      const t = await db.query(
        `SELECT 1 FROM usuarios WHERE id = $1 AND unidade = 'laboratorio'
            AND perfil IN ('laboratorio','adm_laboratorio') AND status = 'ativo'`,
        [tecnicoId],
      );
      if (!t.rows[0]) throw erro(400, 'Técnico não encontrado ou inativo.');
    }
    await db.query(
      'UPDATE ordens_servico SET tecnico_id = $2, atualizado_em = now() WHERE id = $1',
      [id, tecnicoId],
    );
    return { antes, depois: await buscar(id, usuario, { db }) };
  });
}

async function listarProvas(id, db = { query }) {
  const { rows } = await db.query(
    `SELECT pv.id, pv.numero, pv.enviada_em, pv.devolvida_em, pv.resultado, pv.motivo, u.nome AS usuario_nome
       FROM os_provas pv LEFT JOIN usuarios u ON u.id = pv.usuario_id WHERE pv.os_id = $1 ORDER BY pv.numero`,
    [id],
  );
  return rows;
}

async function listarRefacoes(id, db = { query }) {
  const { rows } = await db.query(
    `SELECT r.id, r.numero, r.motivo, r.data, u.nome AS usuario_nome
       FROM os_refacoes r LEFT JOIN usuarios u ON u.id = r.usuario_id WHERE r.os_id = $1 ORDER BY r.numero`,
    [id],
  );
  return rows;
}

/** Devolução da prova que estava na clínica: aprovada segue para acabamento; com ajuste, volta à estrutura. */
async function devolverProva(id, d, usuario) {
  if (d.resultado === 'ajuste' && !d.motivo) throw erro(400, 'Informe o que precisa ser ajustado.');
  const destino = d.etapa || (d.resultado === 'aprovada' ? 'acabamento' : 'estrutura');
  if (destino === 'prova') throw erro(400, 'Escolha a etapa para onde a peça segue.');
  return comTransacao(
    usuario.id,
    async (db) => {
      await db.query('SELECT 1 FROM ordens_servico WHERE id = $1 FOR UPDATE', [id]);
      const antes = await buscar(id, usuario, { db });
      if (antes.status !== 'aberta') throw erro(409, 'Só OS em aberto registra prova.');
      const prova = await db.query(
        `UPDATE os_provas SET devolvida_em = clock_timestamp(), resultado = $2, motivo = $3, atualizado_em = now()
          WHERE os_id = $1 AND devolvida_em IS NULL RETURNING id`,
        [id, d.resultado, d.motivo || null],
      );
      if (!prova.rows[0]) throw erro(409, 'Esta OS não tem prova em aberto.');
      await db.query(
        `UPDATE ordens_servico SET etapa_producao = $2,
                etapa = CASE WHEN origem = 'propria' THEN 'laboratorio' ELSE etapa END, atualizado_em = now()
          WHERE id = $1`,
        [id, destino],
      );
      return {
        antes,
        depois: await buscar(id, usuario, { db }),
        provas: await listarProvas(id, db),
      };
    },
    d.motivo || 'Prova devolvida',
  );
}

async function registrarRefacao(id, d, usuario) {
  const destino = d.etapa || 'modelo';
  if (['prova', 'enviada', 'pronta'].includes(destino)) {
    throw erro(400, 'A refação recomeça em uma etapa de produção.');
  }
  return comTransacao(
    usuario.id,
    async (db) => {
      await db.query('SELECT 1 FROM ordens_servico WHERE id = $1 FOR UPDATE', [id]);
      const antes = await buscar(id, usuario, { db });
      if (antes.status !== 'aberta') throw erro(409, 'Só OS em aberto registra refação.');
      // Prova que estava na clínica volta junto com o pedido de refação.
      await db.query(
        `UPDATE os_provas SET devolvida_em = clock_timestamp(), resultado = 'ajuste', motivo = $2, atualizado_em = now()
          WHERE os_id = $1 AND devolvida_em IS NULL`,
        [id, d.motivo],
      );
      await db.query(
        `INSERT INTO os_refacoes (os_id, numero, motivo, usuario_id)
         VALUES ($1, (SELECT count(*) + 1 FROM os_refacoes WHERE os_id = $1), $2, $3)`,
        [id, d.motivo, usuario.id],
      );
      await db.query(
        `UPDATE ordens_servico SET etapa_producao = $2,
                etapa = CASE WHEN origem = 'propria' THEN 'laboratorio' ELSE etapa END, atualizado_em = now()
          WHERE id = $1`,
        [id, destino],
      );
      return {
        antes,
        depois: await buscar(id, usuario, { db }),
        refacoes: await listarRefacoes(id, db),
      };
    },
    `Refação: ${d.motivo}`,
  );
}

async function tiposTrabalho() {
  const { rows } = await query(
    `SELECT DISTINCT ON (lower(t)) t AS tipo FROM (
       SELECT tipo_trabalho AS t FROM tabela_precos UNION SELECT tipo_trabalho FROM ordens_servico
     ) x ORDER BY lower(t), t`,
  );
  return rows.map((r) => r.tipo);
}

/* ------------------------------ anexos ------------------------------ */

const COL_ANEXO = `a.id, a.os_id, a.tipo, a.nome, a.mime, a.tamanho, a.criado_em, u.nome AS enviado_por`;

async function listarAnexos(id, usuario) {
  await buscar(id, usuario, { detalhe: false });
  const { rows } = await query(
    `SELECT ${COL_ANEXO} FROM anexos a LEFT JOIN usuarios u ON u.id = a.usuario_id
      WHERE a.os_id = $1 ORDER BY a.criado_em DESC`,
    [id],
  );
  return rows;
}

async function enviarAnexo(id, usuario, { tipo, file }) {
  const os = await buscar(id, usuario, { detalhe: false });
  if (os.status === 'cancelada') throw erro(409, 'OS cancelada não recebe anexos.');
  if (!file || !file.buffer?.length) throw erro(400, 'Envie um arquivo.');
  const mimeReal = arquivo.detectarMime(file.buffer);
  if (!mimeReal) throw erro(415, 'Tipo de arquivo não aceito. Envie JPG, PNG, WEBP ou PDF.');
  if (file.mimetype && file.mimetype !== mimeReal) {
    throw erro(415, 'O conteúdo do arquivo não corresponde ao tipo informado.');
  }
  const caminho = await arquivo.gravar(file.buffer);
  const { rows } = await query(
    `INSERT INTO anexos (os_id, tipo, nome, mime, tamanho, caminho, usuario_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [id, tipo, arquivo.sanitizarNome(file.originalname), mimeReal, file.size, caminho, usuario.id],
  );
  return buscarAnexo(id, rows[0].id, usuario);
}

async function buscarAnexo(id, anexoId, usuario) {
  await buscar(id, usuario, { detalhe: false });
  const { rows } = await query(
    `SELECT ${COL_ANEXO} FROM anexos a LEFT JOIN usuarios u ON u.id = a.usuario_id
      WHERE a.id = $1 AND a.os_id = $2`,
    [anexoId, id],
  );
  if (!rows[0]) throw erro(404, 'Anexo não encontrado.');
  return rows[0];
}

/* ------------------------------ tabela de preços ------------------------------ */

async function listarPrecos() {
  const { rows } = await query(
    `SELECT DISTINCT ON (lower(t.tipo_trabalho), t.cliente_id)
            t.id, t.tipo_trabalho, t.cliente_id, c.razao_social AS cliente_nome, t.valor,
            t.vigencia_inicio::text AS vigencia_inicio
       FROM tabela_precos t LEFT JOIN laboratorio_clientes c ON c.id = t.cliente_id
      WHERE t.vigencia_inicio <= ${HOJE}
      ORDER BY lower(t.tipo_trabalho), t.cliente_id, t.vigencia_inicio DESC`,
  );
  return rows.map((r) => ({ ...r, valor: Number(r.valor) }));
}

async function salvarPrecos(itens) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const i of itens) {
      if (i.cliente_id) {
        const c = await client.query('SELECT 1 FROM laboratorio_clientes WHERE id = $1', [
          i.cliente_id,
        ]);
        if (!c.rows[0]) throw erro(400, 'Cliente não encontrado.');
      }
      await client.query(
        `INSERT INTO tabela_precos (tipo_trabalho, cliente_id, valor, vigencia_inicio)
         VALUES ($1, $2, $3, COALESCE($4::date, ${HOJE}))
         ON CONFLICT (lower(tipo_trabalho), COALESCE(cliente_id, '00000000-0000-0000-0000-000000000000'::uuid), vigencia_inicio)
         DO UPDATE SET valor = EXCLUDED.valor, atualizado_em = now()`,
        [i.tipo_trabalho, i.cliente_id || null, i.valor, i.vigencia_inicio || null],
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  return listarPrecos();
}

module.exports = {
  ETAPAS,
  PRODUCAO,
  erro,
  formatar,
  paraAuditoria,
  buscar,
  listar,
  atrasadas,
  criarPropria,
  criarExterna,
  editar,
  mover,
  cancelar,
  historico,
  tecnicos,
  atribuirTecnico,
  listarProvas,
  listarRefacoes,
  devolverProva,
  registrarRefacao,
  tiposTrabalho,
  listarAnexos,
  enviarAnexo,
  buscarAnexo,
  listarPrecos,
  salvarPrecos,
  SELECT_OS,
  HOJE,
};
