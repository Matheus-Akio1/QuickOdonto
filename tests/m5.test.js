process.env.AUTH_RATE_LIMIT = '1000';

const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const { query, pool } = require('../src/config/db');

const SENHA = 'Teste@12345';
const DOMINIO = '@m5-test.quickodonto.test';
const email = (p) => `${p}${DOMINIO}`;
const V1 = '/api/v1';
const esperar = (ms = 200) => new Promise((r) => setTimeout(r, ms));

function gerarCpf(base) {
  const d = String(base).padStart(9, '0').split('').map(Number);
  const dv = (arr) => {
    const r = (arr.reduce((acc, n, i) => acc + n * (arr.length + 1 - i), 0) * 10) % 11;
    return r === 10 ? 0 : r;
  };
  d.push(dv(d));
  d.push(dv(d));
  return d.join('');
}

async function criarUsuario(prefixo, perfil, unidade, { profissional } = {}) {
  const hash = await bcrypt.hash(SENHA, 4);
  const { rows } = await query(
    'INSERT INTO usuarios (nome, email, senha_hash, perfil, unidade) VALUES ($1,$2,$3,$4,$5) RETURNING id',
    [prefixo, email(prefixo), hash, perfil, unidade],
  );
  if (profissional) {
    await query("INSERT INTO profissionais (usuario_id, cro) VALUES ($1, 'CRO-SP 5555')", [
      rows[0].id,
    ]);
  }
  return rows[0].id;
}

async function entrar(prefixo) {
  const res = await request(app)
    .post(`${V1}/auth/login`)
    .send({ email: email(prefixo), senha: SENHA });
  expect(res.status).toBe(200);
  const cookies = (res.headers['set-cookie'] || []).map((c) => c.split(';')[0]);
  const com = (m) => (url) =>
    request(app)[m](`${V1}${url}`).set('Cookie', cookies).set('X-CSRF-Token', res.body.csrfToken);
  return { get: com('get'), post: com('post'), patch: com('patch') };
}

const diasAFrente = (n) =>
  new Date(Date.now() + n * 86400000 - 3 * 3600000).toISOString().slice(0, 10);

let sec;
let clin;
let admc;
let lab;
let adml;
const ids = {};
let liga; // produto do laboratório
let luvas; // produto da clínica

const permitir = (chave, habilitado) =>
  query(
    `INSERT INTO perfis_permissoes (perfil, chave, habilitado) VALUES ('laboratorio', $1, $2)
     ON CONFLICT (perfil, chave) DO UPDATE SET habilitado = EXCLUDED.habilitado`,
    [chave, habilitado],
  );
const produto = (extra = {}) => ({
  nome: 'Liga Ni-Cr',
  codigo: 'NC-0918',
  categoria: 'Metais',
  unidade_medida: 'g',
  estoque_minimo: 500,
  ...extra,
});
const entrada = (quem, corpo) => quem.post('/estoque/entradas').send(corpo);
const retirada = (quem, corpo) =>
  quem.post('/estoque/retiradas').send({ motivo: 'producao', ...corpo });
const saldoDe = async (quem, id) =>
  (await quem.get('/estoque/produtos')).body.find((p) => p.id === id);

beforeAll(async () => {
  ids.sec = await criarUsuario('sec', 'secretaria', 'clinica');
  ids.clin = await criarUsuario('clin', 'clinica', 'clinica', { profissional: true });
  ids.admc = await criarUsuario('admc', 'adm_clinica', 'clinica');
  ids.lab = await criarUsuario('lab', 'laboratorio', 'laboratorio');
  ids.adml = await criarUsuario('adml', 'adm_laboratorio', 'laboratorio');
  [sec, clin, admc, lab, adml] = await Promise.all(
    ['sec', 'clin', 'admc', 'lab', 'adml'].map(entrar),
  );
  await permitir('entrada_estoque', false);
});

afterAll(async () => {
  // TRUNCATE não dispara os triggers de imutabilidade — só serve para limpar o banco de teste.
  await query('TRUNCATE produtos, ordens_servico, laboratorio_clientes CASCADE');
  await query("DELETE FROM perfis_permissoes WHERE perfil = 'laboratorio'");
  await query('DELETE FROM pacientes WHERE nome = $1', ['Eva do Estoque']);
  await query(
    'DELETE FROM profissionais WHERE usuario_id IN (SELECT id FROM usuarios WHERE email LIKE $1)',
    [`%${DOMINIO}`],
  );
  await query('DELETE FROM usuarios WHERE email LIKE $1', [`%${DOMINIO}`]);
  await pool.end();
});

describe('autorização (RN-007) e separação por unidade (RN-008, RN-014)', () => {
  test('bloqueado: sem login 401; Secretaria e Dentista não entram no estoque; técnico não cadastra nem ajusta', async () => {
    expect((await request(app).get(`${V1}/estoque/produtos`)).status).toBe(401);
    for (const u of [sec, clin]) {
      expect((await u.get('/estoque/produtos')).status).toBe(403);
      expect((await u.get('/estoque/alertas')).status).toBe(403);
      expect((await u.get('/estoque/movimentacoes')).status).toBe(403);
      expect((await retirada(u, {})).status).toBe(403);
    }
    expect((await lab.post('/estoque/produtos').send(produto())).status).toBe(403);
    expect((await lab.post('/estoque/ajustes').send({})).status).toBe(403);
    expect((await lab.get('/estoque/custo-por-os')).status).toBe(403);
    expect((await admc.get('/estoque/custo-por-os')).status).toBe(403);
  });

  test('cada administrador cadastra na própria unidade; o mesmo código pode existir nas duas; duplicado na unidade é 409', async () => {
    const l = await adml.post('/estoque/produtos').send(produto());
    expect(l.status).toBe(201);
    liga = l.body.id;
    expect(l.body).toMatchObject({
      saldo: 0,
      situacao: 'abaixo_minimo',
      custo_medio: 0,
      lotes: [],
    });

    const c = await admc
      .post('/estoque/produtos')
      .send(
        produto({ nome: 'Luvas de procedimento M', unidade_medida: 'caixas', estoque_minimo: 5 }),
      );
    expect(c.status).toBe(201);
    luvas = c.body.id;

    expect((await adml.post('/estoque/produtos').send(produto({ nome: 'Outra' }))).status).toBe(
      409,
    );
    expect((await adml.post('/estoque/produtos').send({ nome: 'X' })).status).toBe(400);
  });

  test('uma unidade não lê nem movimenta o estoque da outra (404, sem revelar que existe)', async () => {
    expect((await adml.get('/estoque/produtos')).body.map((p) => p.id)).toEqual([liga]);
    expect((await admc.get('/estoque/produtos')).body.map((p) => p.id)).toEqual([luvas]);
    expect((await lab.get('/estoque/produtos')).body.map((p) => p.id)).toEqual([liga]);

    expect((await adml.patch(`/estoque/produtos/${luvas}`).send({ nome: 'Invadido' })).status).toBe(
      404,
    );
    const e = await entrada(adml, { produto_id: luvas, quantidade: 1, custo_unitario: 1 });
    expect(e.status).toBe(404);
    expect((await retirada(admc, { produto_id: liga, quantidade: 1, motivo: 'uso' })).status).toBe(
      404,
    );
    expect((await admc.get(`/estoque/movimentacoes?produto=${liga}`)).body).toEqual([]);
  });
});

describe('entradas', () => {
  test('entrada cria o lote, soma o saldo e calcula o custo médio ponderado', async () => {
    const a = await entrada(adml, {
      produto_id: liga,
      quantidade: 400,
      lote: 'L-A',
      validade: diasAFrente(200),
      custo_unitario: 2,
      fornecedor: 'Dental Metal',
      nota_fiscal: 'NF 1234',
    });
    expect(a.status).toBe(201);
    expect(a.body).toMatchObject({
      saldo: 400,
      custo_medio: 2,
      valor: 800,
      fornecedor: 'Dental Metal',
    });
    expect(a.body.lotes).toEqual([
      expect.objectContaining({ lote: 'L-A', saldo: 400, validade: diasAFrente(200) }),
    ]);

    // 400 g a R$ 2,00 + 600 g a R$ 1,00 = custo médio R$ 1,40
    const b = await entrada(adml, {
      produto_id: liga,
      quantidade: 600,
      lote: 'L-B',
      validade: diasAFrente(100),
      custo_unitario: 1,
    });
    expect(b.body).toMatchObject({
      saldo: 1000,
      custo_medio: 1.4,
      valor: 1400,
      situacao: 'normal',
    });
    // O lote que vence antes vem primeiro.
    expect(b.body.lotes.map((l) => l.lote)).toEqual(['L-B', 'L-A']);

    // Mesma identificação de lote soma no lote existente.
    const c = await entrada(adml, {
      produto_id: liga,
      quantidade: 50,
      lote: 'L-A',
      custo_unitario: 1.4,
    });
    expect(c.body.lotes.find((l) => l.lote === 'L-A').saldo).toBe(450);

    const ruim = { produto_id: liga, quantidade: 0, custo_unitario: 1 };
    expect((await entrada(adml, ruim)).status).toBe(400);
  });

  test('permissão configurável: técnico sem "entrada de estoque" recebe 403; com ela, registra — e nunca vê custo', async () => {
    const corpo = { produto_id: liga, quantidade: 10, lote: 'L-A', custo_unitario: 1.4 };
    expect((await entrada(lab, corpo)).status).toBe(403);
    await permitir('entrada_estoque', true);
    const r = await entrada(lab, corpo);
    expect(r.status).toBe(201);
    expect(r.body.saldo).toBe(1060);
    expect(r.body).not.toHaveProperty('custo_medio');
    expect(r.body).not.toHaveProperty('valor');
    const mov = await lab.get('/estoque/movimentacoes?tipo=entrada');
    expect(mov.body.length).toBe(4);
    expect(mov.body.every((m) => !('custo' in m))).toBe(true);
    expect((await adml.get('/estoque/movimentacoes?tipo=entrada')).body[0].custo).toBe(1.4);
  });
});

describe('RN-005 — retirada não deixa saldo negativo', () => {
  test('retirada maior que o saldo é recusada inteira; o banco também recusa saldo negativo', async () => {
    const r = await retirada(lab, { produto_id: liga, quantidade: 5000 });
    expect(r.status).toBe(409);
    expect(r.body.erro).toMatch(/Saldo insuficiente/);
    expect((await saldoDe(lab, liga)).saldo).toBe(1060);

    await expect(
      query('UPDATE lotes SET saldo = -1 WHERE produto_id = $1', [liga]),
    ).rejects.toThrow(/lotes_saldo_rn005_chk/);
  });

  test('sem lote informado, sai primeiro do que vence antes e pode usar mais de um lote', async () => {
    // L-B (vence antes) tem 600; retirar 650 esvazia L-B e tira 50 de L-A.
    const r = await retirada(lab, { produto_id: liga, quantidade: 650 });
    expect(r.status).toBe(201);
    expect(r.body.saldo).toBe(410);
    const lotes = Object.fromEntries(r.body.lotes.map((l) => [l.lote, l.saldo]));
    expect(lotes).toEqual({ 'L-B': 0, 'L-A': 410 });
    const mov = await lab.get('/estoque/movimentacoes?tipo=retirada');
    expect(mov.body.map((m) => [m.lote, m.quantidade, m.saldo_apos])).toEqual([
      ['L-A', 50, 410],
      ['L-B', 600, 0],
    ]);
    expect(mov.body[0].usuario_nome).toBe('lab');
  });

  test('cruzar o mínimo avisa a administração da unidade, uma vez', async () => {
    const n = await query(
      "SELECT titulo, link FROM notificacoes WHERE usuario_id = $1 AND tipo = 'estoque'",
      [ids.adml],
    );
    expect(n.rows).toEqual([
      { titulo: 'Estoque: Liga Ni-Cr abaixo do mínimo', link: '/admin/lab/estoque' },
    ]);
    const outro = await query(
      "SELECT 1 FROM notificacoes WHERE usuario_id = $1 AND tipo = 'estoque'",
      [ids.admc],
    );
    expect(outro.rows).toHaveLength(0);
    expect((await saldoDe(lab, liga)).situacao).toBe('abaixo_minimo');
  });

  test('duas retiradas simultâneas que juntas estourariam o saldo: só uma passa', async () => {
    // Saldo 410; duas de 300 ao mesmo tempo.
    const [a, b] = await Promise.all([
      retirada(lab, { produto_id: liga, quantidade: 300 }),
      retirada(adml, { produto_id: liga, quantidade: 300 }),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect((await saldoDe(lab, liga)).saldo).toBe(110);
  });

  test('retirada de um lote específico respeita o saldo daquele lote', async () => {
    const p = await saldoDe(lab, liga);
    const vazio = p.lotes.find((l) => l.lote === 'L-B').id;
    const r = await retirada(lab, { produto_id: liga, lote_id: vazio, quantidade: 1 });
    expect(r.status).toBe(409);
  });
});

describe('retirada vinculada à OS e custo por OS', () => {
  let os;

  beforeAll(async () => {
    const pac = (
      await sec.post('/pacientes').send({ nome: 'Eva do Estoque', cpf: gerarCpf(500001) })
    ).body.id;
    const r = await clin.post('/ordens-servico').send({
      paciente_id: pac,
      tipo_trabalho: 'Coroa metalocerâmica',
      previsao_entrega: diasAFrente(10),
    });
    expect(r.status).toBe(201);
    os = r.body;
  });

  test('laboratório vincula a retirada à OS aberta; clínica não vincula; OS inexistente é recusada', async () => {
    const r = await retirada(lab, { produto_id: liga, quantidade: 10, os_id: os.id });
    expect(r.status).toBe(201);
    const perda = {
      produto_id: liga,
      quantidade: 5,
      os_id: os.id,
      motivo: 'perda',
      observacao: 'Fundição falhou',
    };
    expect((await retirada(lab, perda)).status).toBe(201);

    const mov = await lab.get('/estoque/movimentacoes?tipo=retirada');
    expect(mov.body[0]).toMatchObject({ motivo: 'perda', os: { id: os.id, numero: os.numero } });

    await entrada(admc, { produto_id: luvas, quantidade: 10, custo_unitario: 38.9 });
    const clinica = await retirada(admc, {
      produto_id: luvas,
      quantidade: 1,
      os_id: os.id,
      motivo: 'uso',
    });
    expect(clinica.status).toBe(400);
    const semOs = {
      produto_id: liga,
      quantidade: 1,
      os_id: '00000000-0000-4000-8000-000000000000',
    };
    expect((await retirada(lab, semOs)).status).toBe(400);
    expect(
      (await retirada(lab, { produto_id: liga, quantidade: 1, motivo: 'qualquer' })).status,
    ).toBe(400);
  });

  test('custo por OS: soma quantidade × custo médio do momento — só para o Adm. Laboratório', async () => {
    const d = await adml.get(`/estoque/custo-por-os?os_id=${os.id}`);
    expect(d.status).toBe(200);
    expect(d.body.itens).toHaveLength(2);
    expect(d.body.total).toBe(21); // 15 g × R$ 1,40
    const r = await adml.get('/estoque/custo-por-os');
    expect(r.body.ranking).toEqual([
      expect.objectContaining({ id: os.id, numero: os.numero, total: 21, retiradas: 2 }),
    ]);
  });

  test('indicadores: técnico vê contagens; administração vê também valores', async () => {
    const t = await lab.get('/estoque/resumo');
    expect(t.body).toMatchObject({ abaixo_minimo: 1, retiradas_hoje: 5, retiradas_hoje_os: 2 });
    expect(t.body).not.toHaveProperty('valor_estoque');
    expect(t.body).not.toHaveProperty('consumo_mes');
    const a = await adml.get('/estoque/resumo');
    expect(a.body.valor_estoque).toBe(133); // 95 g × R$ 1,40
    expect(a.body.consumo_mes).toBe(1351); // 965 g retirados × R$ 1,40
    expect(a.body.os_no_mes).toBe(1);
  });
});

describe('inventário, validade e histórico', () => {
  test('ajuste exige justificativa, registra a diferença e não aceita saldo igual', async () => {
    const p = await saldoDe(adml, liga);
    const lote = p.lotes.find((l) => l.lote === 'L-A');
    const base = { produto_id: liga, lote_id: lote.id, saldo_contado: 90 };
    expect((await adml.post('/estoque/ajustes').send(base)).status).toBe(400);
    expect(
      (await adml.post('/estoque/ajustes').send({ ...base, justificativa: 'ok' })).status,
    ).toBe(400);
    const r = await adml
      .post('/estoque/ajustes')
      .send({ ...base, justificativa: 'Contagem de inventário de outubro' });
    expect(r.status).toBe(201);
    expect(r.body.saldo).toBe(90);
    const igual = await adml
      .post('/estoque/ajustes')
      .send({ ...base, justificativa: 'Contagem repetida' });
    expect(igual.status).toBe(409);

    const mov = await adml.get('/estoque/movimentacoes?tipo=ajuste');
    expect(mov.body).toHaveLength(1);
    expect(mov.body[0]).toMatchObject({
      quantidade: -5,
      saldo_apos: 90,
      justificativa: 'Contagem de inventário de outubro',
      usuario_nome: 'adml',
    });
  });

  test('movimentações são imutáveis e ajuste sem justificativa não entra nem direto no banco', async () => {
    await expect(query('UPDATE estoque_movimentacoes SET quantidade = 1')).rejects.toThrow();
    await expect(query('DELETE FROM estoque_movimentacoes')).rejects.toThrow();
    await expect(
      query(
        `INSERT INTO estoque_movimentacoes (produto_id, lote_id, tipo, quantidade, saldo_apos)
         SELECT produto_id, id, 'ajuste', 1, 1 FROM lotes LIMIT 1`,
      ),
    ).rejects.toThrow(/mov_ajuste_chk/);
  });

  test('validade em até 30 dias aparece como "vencendo" e entra nos alertas', async () => {
    const acido = (
      await admc.post('/estoque/produtos').send(
        produto({
          nome: 'Ácido fosfórico 37%',
          codigo: 'AC-0612',
          unidade_medida: 'seringas',
          estoque_minimo: 3,
        }),
      )
    ).body.id;
    await entrada(admc, {
      produto_id: acido,
      quantidade: 5,
      lote: 'AC-1',
      validade: diasAFrente(12),
      custo_unitario: 18.2,
    });
    const lista = (await admc.get('/estoque/produtos')).body;
    expect(lista.find((p) => p.id === acido)).toMatchObject({
      situacao: 'vencendo',
      proxima_validade: diasAFrente(12),
    });
    // Ordenados por situação: quem precisa de atenção vem antes.
    expect(lista[lista.length - 1].situacao).toBe('normal');

    const al = await admc.get('/estoque/alertas');
    expect(al.body.vencendo.map((p) => p.id)).toEqual([acido]);
    expect(al.body.abaixo_minimo).toEqual([]);
    expect((await admc.get('/estoque/resumo')).body.lotes_vencendo).toBe(1);
    expect((await lab.get('/estoque/alertas')).body.abaixo_minimo.map((p) => p.id)).toEqual([liga]);
  });

  test('produto com saldo não é inativado; inativo some da lista e não recebe movimentação', async () => {
    expect((await adml.patch(`/estoque/produtos/${liga}`).send({ ativo: false })).status).toBe(409);
    const novo = (
      await adml.post('/estoque/produtos').send(produto({ nome: 'Cera nº 7', codigo: 'CE-0707' }))
    ).body.id;
    const ed = await adml
      .patch(`/estoque/produtos/${novo}`)
      .send({ estoque_minimo: 4, ativo: false });
    expect(ed.body).toMatchObject({ estoque_minimo: 4, ativo: false });
    expect((await adml.get('/estoque/produtos')).body.some((p) => p.id === novo)).toBe(false);
    expect((await adml.get('/estoque/produtos?ativo=todos')).body.some((p) => p.id === novo)).toBe(
      true,
    );
    const e = await entrada(adml, { produto_id: novo, quantidade: 1, custo_unitario: 1 });
    expect(e.status).toBe(409);
  });

  test('toda escrita fica na auditoria da unidade', async () => {
    await esperar();
    const t = await query(
      "SELECT acao, count(*)::int AS n FROM auditoria_logs WHERE entidade = 'estoque' AND unidade = 'laboratorio' GROUP BY acao",
    );
    const porAcao = Object.fromEntries(t.rows.map((r) => [r.acao, r.n]));
    expect(porAcao).toMatchObject({ criar_produto: 2, entrada: 4, ajuste: 1, editar_produto: 1 });
    expect(porAcao.retirada).toBe(4);
  });
});
