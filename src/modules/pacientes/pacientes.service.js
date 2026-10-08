const { query } = require('../../config/db');
const { cifrar, decifrar, hashBusca } = require('../../lib/crypto');
const { mascararCpf, mascararCelular } = require('../../lib/mascara');
const { somenteDigitos } = require('../../lib/validacoes');

const COLUNAS = `id, numero_prontuario, nome, cpf_cifrado, cpf_hash, nascimento::text AS nascimento, sexo,
  celular, email, endereco, responsavel_nome, responsavel_parentesco, responsavel_celular, origem,
  observacoes_cifrado, ativo, criado_em`;

function erro(status, mensagem) {
  return Object.assign(new Error(mensagem), { status });
}

/**
 * Representação enviada ao front: CPF e celulares sempre mascarados (seção 3.1),
 * sem colunas cifradas nem hash. Observações só na ficha (completo = true).
 */
function serializar(p, { completo = false } = {}) {
  const saida = {
    id: p.id,
    numero_prontuario: p.numero_prontuario,
    nome: p.nome,
    cpf: p.cpf_cifrado ? mascararCpf(decifrar(p.cpf_cifrado)) : null,
    nascimento: p.nascimento,
    sexo: p.sexo,
    celular: mascararCelular(p.celular),
    email: p.email,
    responsavel: p.responsavel_nome
      ? {
          nome: p.responsavel_nome,
          parentesco: p.responsavel_parentesco,
          celular: mascararCelular(p.responsavel_celular),
        }
      : null,
    origem: p.origem,
    ativo: p.ativo,
    criado_em: p.criado_em,
  };
  if (completo) {
    saida.endereco = p.endereco;
    saida.observacoes = p.observacoes_cifrado ? decifrar(p.observacoes_cifrado) : null;
  }
  return saida;
}

/** Versão para a trilha de auditoria: mascarada e sem texto livre. */
const paraAuditoria = (p) => serializar(p);

const escaparLike = (t) => t.replace(/[\\%_]/g, (c) => `\\${c}`);

async function buscarLinha(id) {
  const { rows } = await query(`SELECT ${COLUNAS} FROM pacientes WHERE id = $1`, [id]);
  if (!rows[0]) throw erro(404, 'Paciente não encontrado.');
  return rows[0];
}

async function listar({ busca, ativo, pagina, limite }) {
  const cond = [];
  const val = [];
  if (ativo !== 'todos') {
    val.push(ativo === 'true');
    cond.push(`ativo = $${val.length}`);
  }
  if (busca) {
    const ou = [];
    val.push(`%${escaparLike(busca)}%`);
    ou.push(`nome ILIKE $${val.length}`);
    const d = somenteDigitos(busca);
    if (d.length >= 4) {
      val.push(`%${d}%`);
      ou.push(`celular LIKE $${val.length}`);
    }
    if (d.length === 11) {
      val.push(hashBusca(d));
      ou.push(`cpf_hash = $${val.length}`);
    }
    cond.push(`(${ou.join(' OR ')})`);
  }
  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
  const total = await query(`SELECT count(*)::int AS n FROM pacientes ${where}`, val);
  const { rows } = await query(
    `SELECT ${COLUNAS} FROM pacientes ${where} ORDER BY nome LIMIT $${val.length + 1} OFFSET $${val.length + 2}`,
    [...val, limite, (pagina - 1) * limite],
  );
  return { itens: rows.map((r) => serializar(r)), pagina, limite, total: total.rows[0].n };
}

/** Mapeia o objeto validado para colunas (cifrando/hasheando o que for sensível). */
function paraColunas(d) {
  const c = {};
  if ('nome' in d) c.nome = d.nome;
  if ('cpf' in d) {
    const cpf = d.cpf ? somenteDigitos(d.cpf) : null;
    c.cpf_cifrado = cpf ? cifrar(cpf) : null;
    c.cpf_hash = cpf ? hashBusca(cpf) : null;
  }
  if ('nascimento' in d) c.nascimento = d.nascimento;
  if ('sexo' in d) c.sexo = d.sexo;
  if ('celular' in d) c.celular = d.celular ? somenteDigitos(d.celular) : null;
  if ('email' in d) c.email = d.email ? d.email.toLowerCase() : null;
  if ('endereco' in d) c.endereco = d.endereco ? JSON.stringify(d.endereco) : null;
  if ('responsavel_nome' in d) c.responsavel_nome = d.responsavel_nome;
  if ('responsavel_parentesco' in d) c.responsavel_parentesco = d.responsavel_parentesco;
  if ('responsavel_celular' in d) {
    c.responsavel_celular = d.responsavel_celular ? somenteDigitos(d.responsavel_celular) : null;
  }
  if ('origem' in d) c.origem = d.origem;
  if ('observacoes' in d) c.observacoes_cifrado = d.observacoes ? cifrar(d.observacoes) : null;
  return c;
}

function traduzirErroBanco(err) {
  if (err.code === '23505' && /cpf_hash/.test(err.detail || err.constraint || '')) {
    return erro(409, 'Já existe um paciente com este CPF.');
  }
  if (err.code === '23514' && /cpf_ou_resp/.test(err.constraint || '')) {
    return erro(400, 'Paciente sem CPF exige responsável.');
  }
  return err;
}

async function criar(dados) {
  // RN-001: sem CPF, o responsável é obrigatório.
  if (!dados.cpf && !dados.responsavel_nome) throw erro(400, 'Paciente sem CPF exige responsável.');
  const c = paraColunas(dados);
  const campos = Object.keys(c);
  try {
    const { rows } = await query(
      `INSERT INTO pacientes (${campos.join(', ')}) VALUES (${campos.map((_, i) => `$${i + 1}`).join(', ')})
       RETURNING ${COLUNAS}`,
      campos.map((k) => c[k]),
    );
    return rows[0];
  } catch (err) {
    throw traduzirErroBanco(err);
  }
}

async function atualizar(id, dados) {
  const antes = await buscarLinha(id);
  const c = paraColunas(dados);
  const temCpf = 'cpf_hash' in c ? c.cpf_hash !== null : antes.cpf_hash !== null;
  const temResp = 'responsavel_nome' in c ? !!c.responsavel_nome : !!antes.responsavel_nome;
  if (!temCpf && !temResp) throw erro(400, 'Paciente sem CPF exige responsável.');

  const campos = Object.keys(c);
  if (!campos.length) throw erro(400, 'Nada para alterar.');
  try {
    const { rows } = await query(
      `UPDATE pacientes SET ${campos.map((k, i) => `${k} = $${i + 2}`).join(', ')}, atualizado_em = now()
        WHERE id = $1 RETURNING ${COLUNAS}`,
      [id, ...campos.map((k) => c[k])],
    );
    return { antes, depois: rows[0] };
  } catch (err) {
    throw traduzirErroBanco(err);
  }
}

/** RN-009 — ponto único que define "tem histórico". Módulos futuros (prontuário, OS) estendem aqui. */
async function temHistorico(id) {
  const { rows } = await query(
    `SELECT EXISTS (SELECT 1 FROM consultas WHERE paciente_id = $1)
         OR EXISTS (SELECT 1 FROM anamneses WHERE paciente_id = $1)
         OR EXISTS (SELECT 1 FROM evolucoes WHERE paciente_id = $1)
         OR EXISTS (SELECT 1 FROM procedimentos_paciente WHERE paciente_id = $1)
         OR EXISTS (SELECT 1 FROM planos_tratamento WHERE paciente_id = $1)
         OR EXISTS (SELECT 1 FROM anexos WHERE paciente_id = $1)
         OR EXISTS (SELECT 1 FROM acessos_prontuario WHERE paciente_id = $1) AS tem`,
    [id],
  );
  return rows[0].tem;
}

async function removerOuInativar(id) {
  const antes = await buscarLinha(id);
  if (await temHistorico(id)) {
    const { rows } = await query(
      `UPDATE pacientes SET ativo = false, atualizado_em = now() WHERE id = $1 RETURNING ${COLUNAS}`,
      [id],
    );
    return { acao: 'inativado', antes, depois: rows[0] };
  }
  await query('DELETE FROM pacientes WHERE id = $1', [id]);
  return { acao: 'excluido', antes, depois: null };
}

async function revelar(id, campo) {
  const p = await buscarLinha(id);
  if (campo === 'cpf') return p.cpf_cifrado ? decifrar(p.cpf_cifrado) : null;
  if (campo === 'celular') return p.celular;
  if (campo === 'responsavel_celular') return p.responsavel_celular;
  throw erro(400, 'Campo não pode ser revelado.');
}

async function resumo(id) {
  const p = await buscarLinha(id);
  const { rows } = await query(
    `SELECT c.id, c.inicio, c.fim, c.status, c.procedimento_previsto, u.nome AS profissional_nome
       FROM consultas c JOIN profissionais pr ON pr.id = c.profissional_id JOIN usuarios u ON u.id = pr.usuario_id
      WHERE c.paciente_id = $1 AND c.inicio >= now() AND c.status IN ('agendada','confirmada')
      ORDER BY c.inicio LIMIT 5`,
    [id],
  );
  // OS em aberto entram no M3 (ordens de serviço).
  return { paciente: serializar(p), proximas_consultas: rows, os_em_aberto: [] };
}

async function fichaCompleta(id) {
  const p = await buscarLinha(id);
  const c = await query(
    'SELECT id, finalidade, forma, data FROM consentimentos_lgpd WHERE paciente_id = $1 ORDER BY data DESC',
    [id],
  );
  return { ...serializar(p, { completo: true }), consentimentos: c.rows };
}

async function registrarConsentimento(id, usuarioId, { finalidade, forma }) {
  await buscarLinha(id);
  const { rows } = await query(
    `INSERT INTO consentimentos_lgpd (paciente_id, finalidade, forma, registrado_por)
     VALUES ($1,$2,$3,$4) RETURNING id, finalidade, forma, data`,
    [id, finalidade, forma, usuarioId],
  );
  return rows[0];
}

async function paraExportacao() {
  const { rows } = await query(`SELECT ${COLUNAS} FROM pacientes ORDER BY numero_prontuario`);
  return rows.map((r) => serializar(r));
}

module.exports = {
  serializar,
  paraAuditoria,
  listar,
  criar,
  atualizar,
  removerOuInativar,
  temHistorico,
  revelar,
  resumo,
  fichaCompleta,
  registrarConsentimento,
  paraExportacao,
};
