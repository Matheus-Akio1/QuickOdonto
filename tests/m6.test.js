process.env.AUTH_RATE_LIMIT = '1000';

const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const { query, pool } = require('../src/config/db');

const SENHA = 'Teste@12345';
const DOMINIO = '@m6-test.quickodonto.test';
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
    await query("INSERT INTO profissionais (usuario_id, cro) VALUES ($1, 'CRO-SP 6666')", [
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
  return { get: com('get'), post: com('post'), patch: com('patch'), put: com('put') };
}

// Datas sempre no dia de Brasília, o mesmo que o serviço usa (lição 12).
const dia = (n = 0) => new Date(Date.now() + n * 86400000 - 3 * 3600000).toISOString().slice(0, 10);
const HOJE = dia();
const mesAFrente = (data, n) => {
  const d = new Date(`${data}T12:00:00Z`);
  const alvo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(d.getUTCDate(), ultimo));
  return alvo.toISOString().slice(0, 10);
};

let sec;
let clin;
let admc;
let lab;
let adml;
const ids = {};
const cat = { clinica: {}, laboratorio: {} };
let pac;

const lancar = (quem, corpo) => quem.post('/financeiro/lancamentos').send(corpo);
const receita = (extra = {}) => ({
  tipo: 'receita',
  categoria_id: cat.clinica.tratamento,
  descricao: 'Restauração · Fabio Financeiro',
  valor: 300,
  vencimento: HOJE,
  ...extra,
});
const baixa = (quem, id, corpo) => quem.post(`/financeiro/lancamentos/${id}/baixa`).send(corpo);

beforeAll(async () => {
  // Suítes anteriores (planos aprovados no M4) deixam títulos: o financeiro começa do zero aqui.
  await query('TRUNCATE lancamentos, caixas_diarios CASCADE');
  // As categorias do sistema vêm da migration; as criadas em teste saem para a suíte poder repetir.
  await query('DELETE FROM categorias_financeiras WHERE chave IS NULL');
  ids.sec = await criarUsuario('sec', 'secretaria', 'clinica');
  ids.clin = await criarUsuario('clin', 'clinica', 'clinica', { profissional: true });
  ids.admc = await criarUsuario('admc', 'adm_clinica', 'clinica');
  ids.lab = await criarUsuario('lab', 'laboratorio', 'laboratorio');
  ids.adml = await criarUsuario('adml', 'adm_laboratorio', 'laboratorio');
  [sec, clin, admc, lab, adml] = await Promise.all(
    ['sec', 'clin', 'admc', 'lab', 'adml'].map(entrar),
  );
  for (const [u, quem] of [
    ['clinica', admc],
    ['laboratorio', adml],
  ]) {
    for (const c of (await quem.get('/financeiro/categorias')).body) cat[u][c.chave] = c.id;
  }
  pac = (await sec.post('/pacientes').send({ nome: 'Fabio Financeiro', cpf: gerarCpf(600001) }))
    .body.id;
});

afterAll(async () => {
  // TRUNCATE não dispara os triggers de imutabilidade — só serve para limpar o banco de teste.
  await query(
    'TRUNCATE lancamentos, caixas_diarios, ordens_servico, laboratorio_clientes, tabela_precos, produtos CASCADE',
  );
  await query('DELETE FROM categorias_financeiras WHERE chave IS NULL');
  await query('DELETE FROM links_download');
  await pool.end();
});

describe('RN-007 — financeiro é só da administração', () => {
  test('bloqueado: sem login 401; Secretaria, Dentista e técnico recebem 403 em tudo', async () => {
    expect((await request(app).get(`${V1}/financeiro/lancamentos`)).status).toBe(401);
    for (const u of [sec, clin, lab]) {
      expect((await u.get('/financeiro/lancamentos')).status).toBe(403);
      expect((await u.get(`/financeiro/fluxo-caixa?inicio=${HOJE}&fim=${HOJE}`)).status).toBe(403);
      expect((await u.get('/financeiro/contas-receber')).status).toBe(403);
      expect((await u.get('/financeiro/caixa/hoje')).status).toBe(403);
      expect((await lancar(u, receita())).status).toBe(403);
    }
  });

  test('caixa do dia é só da clínica; extrato por cliente é só do laboratório', async () => {
    expect((await adml.get('/financeiro/caixa/hoje')).status).toBe(403);
    expect((await adml.post('/financeiro/caixa/fechar').send({})).status).toBe(403);
    const cliente = '00000000-0000-4000-8000-000000000000';
    expect((await admc.get(`/financeiro/extratos/${cliente}`)).status).toBe(403);
    expect((await admc.get('/financeiro/caixa/hoje')).status).toBe(200);
  });
});

describe('lançamentos e separação por unidade (RN-008, RN-014)', () => {
  let titulo;

  test('cada unidade tem as próprias categorias e não usa as da outra', async () => {
    expect(cat.clinica.tratamento).toBeTruthy();
    expect(cat.laboratorio.servicos_os).toBeTruthy();
    expect(cat.laboratorio.tratamento).toBeUndefined();
    const r = await lancar(admc, receita({ categoria_id: cat.laboratorio.servicos_os }));
    expect(r.status).toBe(400);
    const tipoErrado = await lancar(admc, receita({ categoria_id: cat.clinica.estoque }));
    expect(tipoErrado.status).toBe(400);
    const nova = await admc
      .post('/financeiro/categorias')
      .send({ tipo: 'despesa', nome: 'Marketing' });
    expect(nova.status).toBe(201);
    const repetida = await admc
      .post('/financeiro/categorias')
      .send({ tipo: 'despesa', nome: 'Marketing' });
    expect(repetida.status).toBe(409);
  });

  test('cria receita com paciente; a outra unidade não lê, não edita nem dá baixa (404)', async () => {
    const r = await lancar(admc, receita({ paciente_id: pac }));
    expect(r.status).toBe(201);
    [titulo] = r.body;
    expect(titulo).toMatchObject({
      situacao: 'aberto',
      valor: 300,
      valor_pago: 0,
      saldo: 300,
      atrasado: false,
      paciente: { id: pac, nome: 'Fabio Financeiro' },
    });
    expect((await adml.get('/financeiro/lancamentos')).body).toEqual([]);
    expect((await adml.get(`/financeiro/lancamentos/${titulo.id}`)).status).toBe(404);
    expect((await baixa(adml, titulo.id, { forma: 'pix' })).status).toBe(404);
    expect(
      (await adml.patch(`/financeiro/lancamentos/${titulo.id}`).send({ descricao: 'Invadido' }))
        .status,
    ).toBe(404);
    // Paciente só existe no financeiro da clínica; cliente, só no do laboratório.
    const labComPaciente = {
      ...receita({ paciente_id: pac }),
      categoria_id: cat.laboratorio.servicos_os,
    };
    expect((await lancar(adml, labComPaciente)).status).toBe(400);
  });

  test('baixa parcial e total; excesso, data futura e título quitado são recusados', async () => {
    const parcial = await baixa(admc, titulo.id, { valor: 100, forma: 'pix' });
    expect(parcial.status).toBe(200);
    expect(parcial.body).toMatchObject({ situacao: 'parcial', valor_pago: 100, saldo: 200 });
    expect((await baixa(admc, titulo.id, { valor: 200.01, forma: 'pix' })).status).toBe(409);
    expect((await baixa(admc, titulo.id, { forma: 'pix', data: dia(1) })).status).toBe(400);
    expect((await baixa(admc, titulo.id, { forma: 'cheque' })).status).toBe(400);

    // Com dinheiro movimentado, valor e vencimento travam; cancelar também.
    expect(
      (await admc.patch(`/financeiro/lancamentos/${titulo.id}`).send({ valor: 500 })).status,
    ).toBe(409);
    const semValor = await admc
      .patch(`/financeiro/lancamentos/${titulo.id}`)
      .send({ descricao: 'Restauração 26 · Fabio Financeiro' });
    expect(semValor.status).toBe(200);
    expect(
      (await admc.post(`/financeiro/lancamentos/${titulo.id}/cancelar`).send({ motivo: 'Erro' }))
        .status,
    ).toBe(409);

    // Sem valor informado, a baixa quita o saldo.
    const total = await baixa(admc, titulo.id, { forma: 'credito' });
    expect(total.body).toMatchObject({
      situacao: 'pago',
      valor_pago: 300,
      saldo: 0,
      pagamento: HOJE,
      forma: 'credito',
    });
    expect(total.body.baixas.map((b) => [b.valor, b.forma, b.usuario_nome])).toEqual([
      [100, 'pix', 'admc'],
      [200, 'credito', 'admc'],
    ]);
    expect((await baixa(admc, titulo.id, { forma: 'pix' })).status).toBe(409);
  });

  test('no banco: baixa acima do saldo é recusada e baixas são imutáveis', async () => {
    await expect(
      query(
        "INSERT INTO lancamento_baixas (lancamento_id, valor, data, forma) VALUES ($1, 1, $2, 'pix')",
        [titulo.id, HOJE],
      ),
    ).rejects.toThrow(/baixa maior que o saldo/);
    await expect(query('UPDATE lancamento_baixas SET valor = 1')).rejects.toThrow();
    await expect(query('DELETE FROM lancamento_baixas')).rejects.toThrow();
    await expect(
      query('UPDATE lancamentos SET valor_pago = 10 WHERE id = $1', [titulo.id]),
    ).rejects.toThrow(/lanc_coerencia_chk/);
  });

  test('parcelamento divide o valor (centavos na primeira) com vencimentos mensais', async () => {
    const r = await lancar(admc, receita({ valor: 100, parcelas: 3, vencimento: '2027-01-31' }));
    expect(r.status).toBe(201);
    expect(r.body.map((l) => [l.valor, l.parcela, l.parcelas, l.vencimento])).toEqual([
      [33.34, 1, 3, '2027-01-31'],
      [33.33, 2, 3, mesAFrente('2027-01-31', 1)],
      [33.33, 3, 3, mesAFrente('2027-01-31', 2)],
    ]);
    expect(r.body[1].vencimento).toBe('2027-02-28');
  });

  test('recorrência mensal repete o valor cheio; não combina com parcelamento', async () => {
    const aluguel = {
      tipo: 'despesa',
      categoria_id: cat.clinica.despesa_fixa,
      descricao: 'Aluguel da sala',
      valor: 4800,
      vencimento: '2027-03-05',
      recorrencia: 'mensal',
      repeticoes: 3,
    };
    const r = await lancar(admc, aluguel);
    expect(r.body.map((l) => [l.valor, l.recorrencia, l.vencimento])).toEqual([
      [4800, 'mensal', '2027-03-05'],
      [4800, 'mensal', '2027-04-05'],
      [4800, 'mensal', '2027-05-05'],
    ]);
    expect((await lancar(admc, { ...aluguel, parcelas: 2 })).status).toBe(400);
  });

  test('cancelar sem baixa exige motivo; cancelado sai das listas e não recebe baixa', async () => {
    const [l] = (await lancar(admc, receita({ valor: 50 }))).body;
    expect((await admc.post(`/financeiro/lancamentos/${l.id}/cancelar`).send({})).status).toBe(400);
    const c = await admc
      .post(`/financeiro/lancamentos/${l.id}/cancelar`)
      .send({ motivo: 'Lançado em duplicidade' });
    expect(c.body).toMatchObject({
      situacao: 'cancelado',
      motivo_cancelamento: 'Lançado em duplicidade',
    });
    expect((await baixa(admc, l.id, { forma: 'pix' })).status).toBe(409);
    expect((await admc.get('/financeiro/lancamentos')).body.some((x) => x.id === l.id)).toBe(false);
    const cancelados = await admc.get('/financeiro/lancamentos?situacao=cancelado');
    expect(cancelados.body.map((x) => x.id)).toEqual([l.id]);
  });
});

describe('fluxo de caixa e contas em aberto', () => {
  test('realizado, em aberto e previsto batem com os lançamentos do período', async () => {
    // Até aqui na clínica, com data de hoje: R$ 300 recebidos. Acrescenta uma despesa paga e uma a pagar.
    const [paga] = (
      await lancar(admc, {
        tipo: 'despesa',
        categoria_id: cat.clinica.estoque,
        descricao: 'Dental Sul · materiais',
        valor: 120.5,
        vencimento: HOJE,
        baixa: { forma: 'boleto' },
      })
    ).body;
    expect(paga).toMatchObject({ situacao: 'pago', pagamento: HOJE });
    await lancar(admc, {
      tipo: 'despesa',
      categoria_id: cat.clinica.estoque,
      descricao: 'Luvas',
      valor: 80,
      vencimento: HOJE,
    });
    await lancar(admc, receita({ valor: 400 }));

    const f = await admc.get(`/financeiro/fluxo-caixa?inicio=${HOJE}&fim=${dia(6)}`);
    expect(f.status).toBe(200);
    expect(f.body.receitas).toEqual({ realizado: 300, em_aberto: 400, previsto: 700 });
    expect(f.body.despesas).toEqual({ realizado: 120.5, em_aberto: 80, previsto: 200.5 });
    expect(f.body.saldo).toEqual({ realizado: 179.5, previsto: 499.5 });
    expect(f.body.semanas).toHaveLength(1);
    expect(f.body.semanas[0]).toMatchObject({
      receitas: 300,
      despesas: 120.5,
      a_receber: 400,
      a_pagar: 80,
    });

    // O laboratório, no mesmo período, não enxerga nada disso.
    const outro = await adml.get(`/financeiro/fluxo-caixa?inicio=${HOJE}&fim=${dia(6)}`);
    expect(outro.body.saldo).toEqual({ realizado: 0, previsto: 0 });
    expect((await admc.get(`/financeiro/fluxo-caixa?inicio=${HOJE}&fim=${dia(-1)}`)).status).toBe(
      400,
    );
  });

  test('contas a pagar e a receber: em aberto por vencimento, com total e atrasado', async () => {
    await query("UPDATE lancamentos SET vencimento = vencimento - 10 WHERE descricao = 'Luvas'");
    const p = await admc.get('/financeiro/contas-pagar');
    expect(p.body.atrasado).toBe(80);
    expect(p.body.itens[0]).toMatchObject({ descricao: 'Luvas', atrasado: true, saldo: 80 });
    expect(p.body.itens.every((l) => l.tipo === 'despesa' && l.saldo > 0)).toBe(true);
    const r = await admc.get('/financeiro/contas-receber');
    expect(r.body.itens.every((l) => l.tipo === 'receita')).toBe(true);
    expect(r.body.total).toBe(500); // 400 de hoje + 100 parcelados
  });
});

describe('RN-011 — caixa fechado só muda após reabertura justificada', () => {
  let caixa;
  let pendente;

  test('caixa de hoje soma as baixas por forma de pagamento', async () => {
    const c = await admc.get('/financeiro/caixa/hoje');
    expect(c.body).toMatchObject({ data: HOJE, situacao: 'aberto', id: null });
    expect(c.body.totais.por_forma).toMatchObject({ pix: 100, credito: 200, dinheiro: 0 });
    expect(c.body.totais).toMatchObject({
      entradas: 300,
      saidas: 120.5,
      saldo: 179.5,
      movimentos: 3,
    });
  });

  test('fechar guarda a fotografia; depois disso a baixa do dia é recusada — na API e no banco', async () => {
    [pendente] = (await lancar(admc, receita({ valor: 90 }))).body;
    const f = await admc.post('/financeiro/caixa/fechar').send({});
    expect(f.status).toBe(200);
    caixa = f.body;
    expect(caixa).toMatchObject({ situacao: 'fechado', fechado_por: 'admc' });
    expect(caixa.totais.entradas).toBe(300);
    expect((await admc.post('/financeiro/caixa/fechar').send({})).status).toBe(409);

    const b = await baixa(admc, pendente.id, { forma: 'dinheiro' });
    expect(b.status).toBe(409);
    expect(b.body.erro).toMatch(/caixa deste dia está fechado/);
    const jaPaga = await lancar(admc, receita({ valor: 10, baixa: { forma: 'pix' } }));
    expect(jaPaga.status).toBe(409);
    await expect(
      query(
        "INSERT INTO lancamento_baixas (lancamento_id, valor, data, forma) VALUES ($1, 90, $2, 'pix')",
        [pendente.id, HOJE],
      ),
    ).rejects.toThrow(/caixa do dia fechado/);
    // Baixa com data de outro dia (caixa aberto) continua possível.
    expect(
      (await baixa(admc, pendente.id, { valor: 10, forma: 'pix', data: dia(-1) })).status,
    ).toBe(200);
  });

  test('reabrir exige justificativa — na API e no banco; reaberto, a baixa entra', async () => {
    expect((await admc.post(`/financeiro/caixa/${caixa.id}/reabrir`).send({})).status).toBe(400);
    const curta = await admc
      .post(`/financeiro/caixa/${caixa.id}/reabrir`)
      .send({ justificativa: 'ok' });
    expect(curta.status).toBe(400);
    await expect(
      query('UPDATE caixas_diarios SET reaberto_em = now() WHERE id = $1', [caixa.id]),
    ).rejects.toThrow(/caixa_reabertura_chk/);
    await expect(query('DELETE FROM caixas_diarios WHERE id = $1', [caixa.id])).rejects.toThrow(
      /não pode ser excluído/,
    );

    const r = await admc
      .post(`/financeiro/caixa/${caixa.id}/reabrir`)
      .send({ justificativa: 'Paciente pagou depois do fechamento' });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ situacao: 'aberto', reaberto_por: 'admc' });
    expect(
      (
        await admc
          .post(`/financeiro/caixa/${caixa.id}/reabrir`)
          .send({ justificativa: 'De novo aqui' })
      ).status,
    ).toBe(409);

    expect((await baixa(admc, pendente.id, { forma: 'dinheiro' })).status).toBe(200);
    const de_novo = await admc.post('/financeiro/caixa/fechar').send({});
    expect(de_novo.body.situacao).toBe('fechado');
    expect(de_novo.body.totais.por_forma.dinheiro).toBe(80);
    const lista = await admc.get('/financeiro/caixa/fechamentos');
    expect(lista.body).toHaveLength(1);
    expect(lista.body[0]).toMatchObject({ data: HOJE, situacao: 'fechado' });

    await esperar();
    const t = await query(
      "SELECT acao, depois->>'justificativa' AS j FROM auditoria_logs WHERE entidade = 'caixas_diarios' ORDER BY em",
    );
    expect(t.rows.map((x) => x.acao)).toEqual(['fechar', 'reabrir', 'fechar']);
    expect(t.rows[1].j).toBe('Paciente pagou depois do fechamento');
  });
});

describe('títulos gerados pelos outros módulos', () => {
  let cliente;
  let os;

  test('OS concluída gera o título a receber do laboratório e a conta a pagar da clínica — uma vez só', async () => {
    await query(
      `INSERT INTO perfis_permissoes (perfil, chave, habilitado) VALUES ('laboratorio', 'criar_os_externa', true)
       ON CONFLICT (perfil, chave) DO UPDATE SET habilitado = true`,
    );
    await adml
      .put('/laboratorio/tabela-precos')
      .send({ itens: [{ tipo_trabalho: 'Coroa de zircônia', valor: 480 }] });
    const criada = await clin
      .post('/ordens-servico')
      .send({ paciente_id: pac, tipo_trabalho: 'Coroa de zircônia', previsao_entrega: dia(10) });
    expect(criada.status).toBe(201);
    os = criada.body;
    for (const e of ['modelo', 'pronta', 'entregue']) {
      expect((await lab.patch(`/ordens-servico/${os.id}/etapa`).send({ etapa: e })).status).toBe(
        200,
      );
    }

    const doLab = (await adml.get('/financeiro/lancamentos')).body;
    expect(doLab).toHaveLength(1);
    expect(doLab[0]).toMatchObject({
      tipo: 'receita',
      valor: 480,
      situacao: 'aberto',
      vencimento: dia(30),
      os: { id: os.id, numero: os.numero },
      categoria: { nome: 'Serviços (OS)' },
    });
    expect(doLab[0].cliente.nome).toBeTruthy();
    cliente = doLab[0].cliente.id;

    const daClinica = (await admc.get('/financeiro/contas-pagar')).body.itens.find((l) => l.os);
    expect(daClinica).toMatchObject({
      tipo: 'despesa',
      valor: 480,
      descricao: `${os.numero} · Coroa de zircônia · Lab. QuickOdonto`,
      categoria: { nome: 'Prótese (laboratório)' },
    });
    const n = await query('SELECT count(*)::int AS n FROM lancamentos WHERE os_id = $1', [os.id]);
    expect(n.rows[0].n).toBe(2);
    // Técnico e dentista movimentaram a OS, mas continuam sem ver o financeiro.
    expect((await lab.get('/financeiro/lancamentos')).status).toBe(403);
  });

  test('OS sem preço na tabela não gera título', async () => {
    const semPreco = (
      await clin
        .post('/ordens-servico')
        .send({ paciente_id: pac, tipo_trabalho: 'Trabalho sem preço', previsao_entrega: dia(10) })
    ).body;
    for (const e of ['pronta', 'entregue']) {
      await lab.patch(`/ordens-servico/${semPreco.id}/etapa`).send({ etapa: e });
    }
    const n = await query('SELECT count(*)::int AS n FROM lancamentos WHERE os_id = $1', [
      semPreco.id,
    ]);
    expect(n.rows[0].n).toBe(0);
  });

  test('a receber por cliente e extrato mensal (JSON e PDF por link de uso único)', async () => {
    const titulo = (await adml.get('/financeiro/lancamentos')).body[0];
    await baixa(adml, titulo.id, { valor: 180, forma: 'transferencia' });

    const r = await adml.get(`/financeiro/contas-receber?inicio=${HOJE}&fim=${dia(40)}`);
    expect(r.body.por_cliente).toEqual([
      expect.objectContaining({
        id: cliente,
        tipo: 'interno',
        faturado: 480,
        recebido: 180,
        a_receber: 300,
      }),
    ]);

    const e = await adml.get(`/financeiro/extratos/${cliente}`);
    expect(e.status).toBe(200);
    expect(e.body).toMatchObject({ os_concluidas: 2, total: 480 });
    expect(e.body.itens.map((i) => [i.numero, i.valor, i.paciente])).toEqual(
      expect.arrayContaining([[os.numero, 480, 'Fabio Financeiro']]),
    );
    expect(e.body.resumo[0]).toEqual({
      tipo_trabalho: 'Coroa de zircônia',
      quantidade: 1,
      total: 480,
    });
    expect(e.body.pagamento).toMatchObject({ recebido: 180, a_receber: 300, vencimento: dia(30) });
    expect((await adml.get(`/financeiro/extratos/${cliente}?mes=2020-01`)).body.os_concluidas).toBe(
      0,
    );
    expect((await adml.get(`/financeiro/extratos/${cliente}?mes=2020-13`)).status).toBe(400);

    const link = await adml.post(`/financeiro/extratos/${cliente}/pdf`).send({});
    expect(link.body.url).toMatch(/^\/api\/v1\/arquivos\//);
    const pdf = await request(app)
      .get(link.body.url)
      .buffer(true)
      .parse((res, cb) => {
        const partes = [];
        res.on('data', (c) => partes.push(c));
        res.on('end', () => cb(null, Buffer.concat(partes)));
      });
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect(pdf.body.subarray(0, 5).toString()).toBe('%PDF-');
    expect((await request(app).get(link.body.url)).status).toBe(404);
  });

  test('plano de tratamento aprovado vira conta a receber da clínica', async () => {
    const proc = (
      await admc
        .post('/procedimentos')
        .send({ codigo: 'M6-REST', nome: 'Restauração M6', valor_padrao: 250 })
    ).body.id;
    const plano = await clin.post('/planos-tratamento').send({
      paciente_id: pac,
      itens: [
        { catalogo_id: proc, dente: 26 },
        { catalogo_id: proc, dente: 27 },
      ],
    });
    expect(plano.status).toBe(201);
    expect((await clin.post(`/planos-tratamento/${plano.body.id}/aprovar`)).status).toBe(200);
    const titulo = (await admc.get('/financeiro/contas-receber')).body.itens.find((l) =>
      l.descricao.startsWith('Plano de tratamento'),
    );
    expect(titulo).toMatchObject({
      valor: 500,
      descricao: 'Plano de tratamento · Fabio Financeiro',
      paciente: { id: pac },
      categoria: { nome: 'Tratamento' },
    });
  });

  test('entrada de estoque pode lançar a compra a pagar — só pela administração', async () => {
    const produto = (
      await adml
        .post('/estoque/produtos')
        .send({ nome: 'Liga Ni-Cr', codigo: 'M6-NC', unidade_medida: 'g', estoque_minimo: 0 })
    ).body.id;
    const entrada = {
      produto_id: produto,
      quantidade: 100,
      custo_unitario: 1.9,
      fornecedor: 'Dental Metal',
      lancar_financeiro: true,
    };
    await query(
      `INSERT INTO perfis_permissoes (perfil, chave, habilitado) VALUES ('laboratorio', 'entrada_estoque', true)
       ON CONFLICT (perfil, chave) DO UPDATE SET habilitado = true`,
    );
    expect((await lab.post('/estoque/entradas').send(entrada)).status).toBe(403);
    expect((await adml.post('/estoque/entradas').send(entrada)).status).toBe(201);
    const p = (await adml.get('/financeiro/contas-pagar')).body.itens;
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({
      descricao: 'Dental Metal · Liga Ni-Cr',
      valor: 190,
      categoria: { nome: 'Insumos' },
      vencimento: dia(30),
    });
    // O saldo não entrou duas vezes: a tentativa do técnico foi desfeita por inteiro.
    expect((await adml.get('/estoque/produtos')).body.find((x) => x.id === produto).saldo).toBe(
      100,
    );
  });
});

describe('recibo em PDF', () => {
  test('só para receita com valor recebido, por link de uso único, com download auditado', async () => {
    const pago = (await admc.get('/financeiro/lancamentos?situacao=pago&tipo=receita')).body[0];
    const aberto = (await admc.get('/financeiro/lancamentos?situacao=aberto&tipo=receita')).body[0];
    const despesa = (await admc.get('/financeiro/lancamentos?situacao=pago&tipo=despesa')).body[0];
    expect((await admc.post(`/financeiro/recibos/${aberto.id}`)).status).toBe(409);
    expect((await admc.post(`/financeiro/recibos/${despesa.id}`)).status).toBe(409);
    expect((await adml.post(`/financeiro/recibos/${pago.id}`)).status).toBe(403);

    const link = await admc.post(`/financeiro/recibos/${pago.id}`);
    expect(link.status).toBe(200);
    const pdf = await request(app)
      .get(link.body.url)
      .buffer(true)
      .parse((res, cb) => {
        const partes = [];
        res.on('data', (c) => partes.push(c));
        res.on('end', () => cb(null, Buffer.concat(partes)));
      });
    expect(pdf.status).toBe(200);
    expect(pdf.body.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.headers['cache-control']).toContain('no-store');
    expect((await request(app).get(link.body.url)).status).toBe(404);
    await esperar();
    const t = await query(
      "SELECT acao FROM auditoria_logs WHERE entidade_id = $1 AND acao LIKE '%recibo%' ORDER BY em",
      [pago.id],
    );
    expect(t.rows.map((x) => x.acao)).toEqual(['recibo_pdf', 'download_recibo_pdf']);
  });
});
