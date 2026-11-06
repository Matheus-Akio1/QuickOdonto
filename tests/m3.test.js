process.env.AUTH_RATE_LIMIT = '1000';

const fs = require('fs');
const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const { query, pool } = require('../src/config/db');

const SENHA = 'Teste@12345';
const DOMINIO = '@m3-test.quickodonto.test';
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
    await query("INSERT INTO profissionais (usuario_id, cro) VALUES ($1, 'CRO-SP 3333')", [
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
  return {
    get: com('get'),
    post: com('post'),
    patch: com('patch'),
    put: com('put'),
    delete: com('delete'),
  };
}

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('IHDR-foto-do-modelo'),
]);

const diasAFrente = (n) =>
  new Date(Date.now() + n * 86400000 - 3 * 3600000).toISOString().slice(0, 10);
const PRAZO = diasAFrente(10);
const CNPJ = '11.222.333/0001-81';
const OBS = 'Paciente bruxômano; reforçar a estrutura metálica';

let sec;
let clin;
let admc;
let lab;
let adml;
let ids = {};
let pac;
let externo;

const permitir = (chave, habilitado) =>
  query(
    `INSERT INTO perfis_permissoes (perfil, chave, habilitado) VALUES ('laboratorio', $1, $2)
     ON CONFLICT (perfil, chave) DO UPDATE SET habilitado = EXCLUDED.habilitado`,
    [chave, habilitado],
  );

// Quem gera a OS da clínica é o dentista; ela já nasce enviada ao laboratório.
const novaOs = async (extra = {}) => {
  const r = await clin.post('/ordens-servico').send({
    paciente_id: pac,
    tipo_trabalho: 'Coroa metalocerâmica',
    elementos: [46],
    previsao_entrega: PRAZO,
    ...extra,
  });
  expect(r.status).toBe(201);
  return r.body;
};
const etapaLab = (id, etapa) => lab.patch(`/ordens-servico/${id}/etapa`).send({ etapa });

beforeAll(async () => {
  ids.sec = await criarUsuario('sec', 'secretaria', 'clinica');
  ids.clin = await criarUsuario('clin', 'clinica', 'clinica', { profissional: true });
  ids.admc = await criarUsuario('admc', 'adm_clinica', 'clinica');
  ids.lab = await criarUsuario('lab', 'laboratorio', 'laboratorio');
  ids.adml = await criarUsuario('adml', 'adm_laboratorio', 'laboratorio');
  [sec, clin, admc, lab, adml] = await Promise.all(
    ['sec', 'clin', 'admc', 'lab', 'adml'].map(entrar),
  );
  await permitir('criar_os_externa', false);
  await permitir('cancelar_os', false);
  pac = (await sec.post('/pacientes').send({ nome: 'Olga das Ordens', cpf: gerarCpf(300001) })).body
    .id;
});

afterAll(async () => {
  // TRUNCATE não dispara os triggers de imutabilidade — só serve para limpar o banco de teste.
  await query('TRUNCATE ordens_servico, tabela_precos, laboratorio_clientes CASCADE');
  await query('DELETE FROM pacientes WHERE id = $1', [pac]);
  await query('DELETE FROM links_download');
  await query("DELETE FROM perfis_permissoes WHERE perfil = 'laboratorio'");
  await query(
    'DELETE FROM profissionais WHERE usuario_id IN (SELECT id FROM usuarios WHERE email LIKE $1)',
    [`%${DOMINIO}`],
  );
  await query('DELETE FROM usuarios WHERE email LIKE $1', [`%${DOMINIO}`]);
  fs.rmSync(process.env.STORAGE_DIR, { recursive: true, force: true });
  await pool.end();
});

describe('autorização e escopo por unidade', () => {
  test('bloqueado: sem login 401; Adm. Clínica não acessa OS; clínica não entra em clientes/preços do laboratório', async () => {
    expect((await request(app).get(`${V1}/ordens-servico`)).status).toBe(401);
    expect((await admc.get('/ordens-servico')).status).toBe(403);
    expect((await admc.post('/ordens-servico').send({})).status).toBe(403);
    expect((await sec.get('/laboratorio/clientes')).status).toBe(403);
    expect((await clin.get('/laboratorio/clientes')).status).toBe(403);
    expect((await sec.get('/laboratorio/tabela-precos')).status).toBe(403);
    expect((await sec.get('/ordens-servico/tecnicos')).status).toBe(403);
    expect((await clin.get('/ordens-servico/atrasadas')).status).toBe(403);
  });

  test('permitido: Secretaria, Dentista, Laboratório e Adm. Laboratório leem a lista; RN-007 — preços só para a administração', async () => {
    for (const u of [sec, clin, lab, adml])
      expect((await u.get('/ordens-servico')).status).toBe(200);
    expect((await lab.get('/laboratorio/clientes')).status).toBe(200);
    expect((await lab.get('/laboratorio/tabela-precos')).status).toBe(403);
    expect((await adml.get('/laboratorio/tabela-precos')).status).toBe(200);
  });

  test('Secretaria é somente leitura: lê quadro, detalhe, histórico e anexos; toda escrita é 403', async () => {
    const os = await novaOs();
    const corpo = { paciente_id: pac, tipo_trabalho: 'Coroa', previsao_entrega: PRAZO };
    const etapa = (quem) => quem.patch(`/ordens-servico/${os.id}/etapa`).send({ etapa: 'modelo' });
    expect((await sec.post('/ordens-servico').send(corpo)).status).toBe(403);
    expect((await sec.patch(`/ordens-servico/${os.id}`).send({ cor: 'A1' })).status).toBe(403);
    expect((await etapa(sec)).status).toBe(403);
    expect(
      (await sec.post(`/ordens-servico/${os.id}/cancelar`).send({ motivo: 'Não pode' })).status,
    ).toBe(403);
    expect(
      (
        await sec
          .post(`/ordens-servico/${os.id}/anexos`)
          .field('tipo', 'foto')
          .attach('arquivo', PNG, { filename: 'x.png', contentType: 'image/png' })
      ).status,
    ).toBe(403);

    expect((await sec.get(`/ordens-servico/${os.id}`)).body.etapa).toBe('envio');
    expect((await sec.get(`/ordens-servico/${os.id}/historico`)).status).toBe(200);
    expect((await sec.get(`/ordens-servico/${os.id}/anexos`)).status).toBe(200);
    expect((await sec.get('/ordens-servico/atrasadas')).status).toBe(200);
    // O dentista gera, mas não conduz a produção.
    expect((await etapa(clin)).status).toBe(403);
  });
});

describe('OS da clínica — gerada pelo dentista, já enviada (RN-003 e RN-013)', () => {
  let os;

  test('nasce em "Envio"/"Recebida", com número sequencial, dentista e observações cifradas no banco', async () => {
    os = await novaOs({ observacoes: OBS, cor: 'A2' });
    expect(os.numero).toMatch(/^OS-\d{4}$/);
    expect(os).toMatchObject({
      origem: 'propria',
      etapa: 'envio',
      etapa_producao: 'recebida',
      laboratorio: 'proprio',
      previsao_entrega: PRAZO,
    });
    expect(os.enviado_em).toBeTruthy();
    expect(os.paciente).toEqual({ id: pac, nome: 'Olga das Ordens' });
    expect(os.dentista.nome).toBe('clin');
    expect(os).not.toHaveProperty('valor');

    const outra = await novaOs();
    expect(Number(outra.numero.slice(3))).toBe(Number(os.numero.slice(3)) + 1);

    const { rows } = await query('SELECT observacoes_cifrado FROM ordens_servico WHERE id = $1', [
      os.id,
    ]);
    expect(rows[0].observacoes_cifrado).toMatch(/^v1:/);
    expect(rows[0].observacoes_cifrado).not.toContain('bruxômano');
    expect((await sec.get(`/ordens-servico/${os.id}`)).body.observacoes).toBe(OBS);

    await esperar();
    const trilha = await query(
      "SELECT depois::text AS d FROM auditoria_logs WHERE entidade = 'ordens_servico' AND entidade_id = $1",
      [os.id],
    );
    expect(trilha.rows.length).toBe(1);
    expect(trilha.rows[0].d).not.toContain('bruxômano');
  });

  test('RN-003: sem data prevista não há OS — na API e direto no banco; validações de entrada', async () => {
    const criar = (corpo) => clin.post('/ordens-servico').send(corpo);
    const base = { paciente_id: pac, tipo_trabalho: 'Coroa', previsao_entrega: PRAZO };
    expect((await criar({ paciente_id: pac, tipo_trabalho: 'Coroa' })).status).toBe(400);
    expect((await criar({ ...base, elementos: [99] })).status).toBe(400);
    expect((await criar({ ...base, previsao_entrega: '2020-01-01' })).status).toBe(400);
    const semPaciente = { ...base, paciente_id: '00000000-0000-4000-8000-000000000000' };
    expect((await criar(semPaciente)).status).toBe(400);

    await expect(
      query('UPDATE ordens_servico SET previsao_entrega = NULL WHERE id = $1', [os.id]),
    ).rejects.toThrow(/os_rn003_envio_chk/);
  });

  test('RN-013: o laboratório vê na hora, como "recebida", só com o nome do paciente, e é notificado', async () => {
    const visto = await lab.get(`/ordens-servico/${os.id}`);
    expect(visto.status).toBe(200);
    expect(visto.body).toMatchObject({ etapa_producao: 'recebida', origem: 'propria' });
    expect(visto.body.cliente.tipo).toBe('interno');
    expect(visto.body.paciente).toEqual({ id: null, nome: 'Olga das Ordens' });
    expect(visto.body.observacoes).toBe(OBS);
    expect((await lab.get(`/pacientes/${pac}`)).status).toBe(403);

    const n = await query(
      "SELECT titulo FROM notificacoes WHERE usuario_id = $1 AND tipo = 'os' AND link LIKE $2",
      [ids.lab, `%${os.id}`],
    );
    expect(n.rows[0].titulo).toBe(`${os.numero}: chegou da clínica`);
    expect(n.rows[0].titulo).not.toContain('Olga');
  });

  test('produção: técnico, etapas, prova na clínica, refação, envio, nova volta e conclusão pelo laboratório', async () => {
    const rota = `/ordens-servico/${os.id}`;
    const semTecnico = await lab.post(`${rota}/tecnico`).send({ tecnico_id: ids.sec });
    expect(semTecnico.status).toBe(400);
    const tec = await lab.post(`${rota}/tecnico`).send({ tecnico_id: ids.lab });
    expect(tec.body.tecnico).toEqual({ id: ids.lab, nome: 'lab' });
    expect((await lab.get('/ordens-servico/tecnicos')).body.map((t) => t.id)).toEqual(
      expect.arrayContaining([ids.lab, ids.adml]),
    );

    const modelo = await etapaLab(os.id, 'modelo');
    expect(modelo.body).toMatchObject({ etapa_producao: 'modelo', etapa: 'laboratorio' });
    expect((await etapaLab(os.id, 'modelo')).status).toBe(409);
    expect((await etapaLab(os.id, 'envio')).status).toBe(400);
    expect((await etapaLab(os.id, 'entregue')).status).toBe(409);

    // Prova vai para a clínica: a Secretaria vê a OS em "Retorno".
    const prova = await etapaLab(os.id, 'prova');
    expect(prova.body).toMatchObject({
      etapa_producao: 'prova',
      etapa: 'retorno',
      prova_aberta: true,
    });
    expect((await sec.get(rota)).body.etapa).toBe('retorno');
    expect((await etapaLab(os.id, 'acabamento')).status).toBe(409);
    const aviso = await query(
      'SELECT titulo FROM notificacoes WHERE usuario_id = $1 AND link LIKE $2 ORDER BY criado_em DESC',
      [ids.sec, `%${os.id}`],
    );
    expect(aviso.rows[0].titulo).toContain('prova enviada à clínica');

    expect((await lab.post(`${rota}/provas`).send({ resultado: 'ajuste' })).status).toBe(400);
    expect((await sec.post(`${rota}/provas`).send({ resultado: 'aprovada' })).status).toBe(403);
    const dev = await lab.post(`${rota}/provas`).send({ resultado: 'aprovada' });
    expect(dev.status).toBe(200);
    expect(dev.body.os).toMatchObject({
      etapa_producao: 'acabamento',
      etapa: 'laboratorio',
      prova_aberta: false,
    });
    expect(dev.body.provas[0]).toMatchObject({ numero: 1, resultado: 'aprovada' });
    expect((await lab.post(`${rota}/provas`).send({ resultado: 'aprovada' })).status).toBe(409);

    for (const e of ['pronta', 'enviada']) await etapaLab(os.id, e);
    expect((await sec.get(rota)).body.etapa).toBe('retorno');

    // A peça enviada voltou para refazer: a OS continua aberta e retorna à produção.
    const ref = await lab.post(`${rota}/refacoes`).send({ motivo: 'Cor fora do padrão pedido' });
    expect(ref.status).toBe(200);
    expect(ref.body.os).toMatchObject({
      etapa_producao: 'modelo',
      etapa: 'laboratorio',
      refacoes: 1,
    });
    expect(ref.body.refacoes[0]).toMatchObject({ numero: 1, motivo: 'Cor fora do padrão pedido' });
    await expect(query('DELETE FROM os_refacoes WHERE os_id = $1', [os.id])).rejects.toThrow();

    for (const e of ['estrutura', 'acabamento', 'pronta']) {
      expect((await etapaLab(os.id, e)).body.etapa).toBe('laboratorio');
    }
    const enviada = await etapaLab(os.id, 'enviada');
    expect(enviada.body).toMatchObject({ etapa_producao: 'enviada', etapa: 'retorno' });

    // Só depois disso o laboratório conclui; a Secretaria vê "Concluída".
    const fim = await etapaLab(os.id, 'entregue');
    expect(fim.status).toBe(200);
    expect(fim.body).toMatchObject({ status: 'concluida', etapa: 'concluida' });
    expect(fim.body.concluida_em).toBeTruthy();
    expect((await etapaLab(os.id, 'modelo')).status).toBe(409);

    const detalhe = await sec.get(rota);
    expect(detalhe.body).toMatchObject({ status: 'concluida', etapa: 'concluida' });
    expect(detalhe.body.historico_provas).toHaveLength(1);
    expect(detalhe.body.historico_refacoes).toHaveLength(1);
  });

  test('RN-012: toda mudança de etapa tem usuário e data/hora, em ordem; histórico é imutável', async () => {
    const h = await sec.get(`/ordens-servico/${os.id}/historico`);
    expect(h.status).toBe(200);
    expect(h.body.every((l) => l.usuario_nome && l.em)).toBe(true);
    expect(h.body[0]).toMatchObject({
      lado: 'clinica',
      de_etapa: null,
      para_etapa: 'envio',
      usuario_nome: 'clin',
    });
    const clinica = h.body.filter((l) => l.lado === 'clinica').map((l) => l.para_etapa);
    expect(clinica).toEqual([
      'envio',
      'laboratorio',
      'retorno',
      'laboratorio',
      'retorno',
      'laboratorio',
      'retorno',
      'concluida',
    ]);
    const producao = h.body.filter((l) => l.lado === 'laboratorio').map((l) => l.para_etapa);
    expect(producao).toEqual([
      'modelo',
      'prova',
      'acabamento',
      'pronta',
      'enviada',
      'modelo',
      'estrutura',
      'acabamento',
      'pronta',
      'enviada',
    ]);
    const tempos = h.body.map((l) => new Date(l.em).getTime());
    expect([...tempos].sort((a, b) => a - b)).toEqual(tempos);
    expect(h.body.find((l) => l.observacao?.startsWith('Refação'))).toBeTruthy();
    expect((await clin.get(`/ordens-servico/${os.id}/historico`)).status).toBe(403);

    await expect(
      query("UPDATE os_historico SET para_etapa = 'envio' WHERE os_id = $1", [os.id]),
    ).rejects.toThrow();
    await expect(query('DELETE FROM os_historico WHERE os_id = $1', [os.id])).rejects.toThrow();
    await expect(query('DELETE FROM ordens_servico WHERE id = $1', [os.id])).rejects.toThrow(
      /não pode ser excluída/,
    );
  });

  test('RN-012 no banco: mudar etapa sem usuário identificado é recusado', async () => {
    const nova = await novaOs();
    await expect(
      query(
        "UPDATE ordens_servico SET status = 'cancelada', motivo_cancelamento = 'x', cancelada_em = now() WHERE id = $1",
        [nova.id],
      ),
    ).rejects.toThrow(/sem usuário identificado/);
  });
});

describe('RN-004 — atrasadas e a vencer', () => {
  test('previsão anterior a hoje e OS aberta = atrasada; até 3 dias = a vencer; concluída não entra', async () => {
    const atrasada = await novaOs();
    const vencendo = await novaOs();
    // Não há como informar prazo no passado pela API: o teste retroage direto no banco
    // (na data de Brasília, a mesma que o serviço usa — CURRENT_DATE do banco é UTC).
    await query(
      `UPDATE ordens_servico SET previsao_entrega = (now() AT TIME ZONE 'America/Sao_Paulo')::date - 4 WHERE id = $1`,
      [atrasada.id],
    );
    await query(
      `UPDATE ordens_servico SET previsao_entrega = (now() AT TIME ZONE 'America/Sao_Paulo')::date + 2 WHERE id = $1`,
      [vencendo.id],
    );

    for (const u of [sec, lab, adml]) {
      const r = await u.get('/ordens-servico/atrasadas');
      expect(r.status).toBe(200);
      const a = r.body.atrasadas.find((o) => o.id === atrasada.id);
      expect(a.prazo).toEqual({ situacao: 'atrasada', dias: 4 });
      const v = r.body.a_vencer.find((o) => o.id === vencendo.id);
      expect(v.prazo).toEqual({ situacao: 'a_vencer', dias: 2 });
    }

    await adml
      .post(`/ordens-servico/${atrasada.id}/cancelar`)
      .send({ motivo: 'Paciente desistiu' });
    const depois = await sec.get('/ordens-servico/atrasadas');
    expect(depois.body.atrasadas.some((o) => o.id === atrasada.id)).toBe(false);
  });
});

describe('clientes do laboratório (cadernos)', () => {
  test('CNPJ inválido 400; cadastro cifra o documento; lista devolve mascarado; duplicado 409', async () => {
    const ruim = await lab
      .post('/laboratorio/clientes')
      .send({ razao_social: 'Clínica Ruim', documento: '11.222.333/0001-82' });
    expect(ruim.status).toBe(400);

    const r = await lab.post('/laboratorio/clientes').send({
      razao_social: 'Clínica Sorriso Vivo',
      documento: CNPJ,
      responsavel: 'Dra. Renata Kruger',
      cro: 'CRO-PR 21.877',
      telefone: '(45) 3033-4412',
      endereco: { cidade: 'Toledo', uf: 'PR' },
      condicao_pagamento: '30 dias',
    });
    expect(r.status).toBe(201);
    externo = r.body.id;
    expect(r.body).toMatchObject({
      tipo: 'externo',
      documento: '**.222.333/0001-**',
      documento_tipo: 'cnpj',
      telefone: '(45) *****-4412',
      os_abertas: 0,
    });

    const banco = await query(
      'SELECT documento_cifrado, documento_hash FROM laboratorio_clientes WHERE id = $1',
      [externo],
    );
    expect(banco.rows[0].documento_cifrado).toMatch(/^v1:/);
    expect(banco.rows[0].documento_cifrado).not.toContain('11222333');
    expect(banco.rows[0].documento_hash).toMatch(/^[0-9a-f]{64}$/);

    const dup = await lab
      .post('/laboratorio/clientes')
      .send({ razao_social: 'Outra', documento: '11222333000181' });
    expect(dup.status).toBe(409);

    const lista = await lab.get('/laboratorio/clientes');
    expect(lista.body.find((c) => c.id === externo).documento).toBe('**.222.333/0001-**');
    // A clínica própria entra como cliente interno assim que a primeira OS existe.
    expect(lista.body[0].tipo).toBe('interno');
  });

  test('revelar documento exige o laboratório e fica na auditoria sem o valor', async () => {
    const r = await lab.get(`/laboratorio/clientes/${externo}/revelar/documento`);
    expect(r.body).toEqual({ campo: 'documento', valor: '11222333000181' });
    expect((await lab.get(`/laboratorio/clientes/${externo}/revelar/email`)).status).toBe(400);
    expect((await sec.get(`/laboratorio/clientes/${externo}/revelar/documento`)).status).toBe(403);
    await esperar();
    const t = await query(
      "SELECT antes::text || depois::text AS txt FROM auditoria_logs WHERE entidade = 'laboratorio_clientes' AND acao = 'revelar_documento'",
    );
    expect(t.rows.length).toBe(1);
    expect(t.rows[0].txt).not.toContain('11222333000181');
  });

  test('edição: troca condição de pagamento; a clínica própria não pode ser inativada', async () => {
    const ed = await lab
      .patch(`/laboratorio/clientes/${externo}`)
      .send({ condicao_pagamento: '30/60 dias' });
    expect(ed.body.condicao_pagamento).toBe('30/60 dias');
    const interno = (await lab.get('/laboratorio/clientes?tipo=interno')).body[0];
    const r = await lab.patch(`/laboratorio/clientes/${interno.id}`).send({ ativo: false });
    expect(r.status).toBe(409);
  });
});

describe('OS externa — criada pelo laboratório', () => {
  const corpo = () => ({
    cliente_id: externo,
    paciente_nome: 'Antônio Prado',
    dentista_nome: 'Dra. Renata Kruger',
    tipo_trabalho: 'Prótese total superior',
    previsao_entrega: PRAZO,
  });
  let ext;

  test('permissão configurável: técnico sem "criar OS externa" recebe 403; com ela, cria', async () => {
    expect((await lab.post('/ordens-servico').send(corpo())).status).toBe(403);
    await permitir('criar_os_externa', true);
    const r = await lab.post('/ordens-servico').send(corpo());
    expect(r.status).toBe(201);
    ext = r.body;
    expect(ext.numero).toMatch(/^L-\d{4}$/);
    expect(ext).toMatchObject({ origem: 'externa', etapa: null, etapa_producao: 'recebida' });
    expect(ext.paciente).toEqual({ id: null, nome: 'Antônio Prado' });

    const semPrazo = { ...corpo() };
    delete semPrazo.previsao_entrega;
    expect((await lab.post('/ordens-servico').send(semPrazo)).status).toBe(400);
    const interno = (await lab.get('/laboratorio/clientes?tipo=interno')).body[0];
    const naPropria = await lab
      .post('/ordens-servico')
      .send({ ...corpo(), cliente_id: interno.id });
    expect(naPropria.status).toBe(400);
  });

  test('a clínica não enxerga OS externa', async () => {
    expect((await sec.get(`/ordens-servico/${ext.id}`)).status).toBe(404);
    expect((await sec.get('/ordens-servico?status=todas')).body.some((o) => o.id === ext.id)).toBe(
      false,
    );
    expect((await sec.patch(`/ordens-servico/${ext.id}`).send({ cor: 'A1' })).status).toBe(403);
    expect((await clin.get(`/ordens-servico/${ext.id}`)).status).toBe(404);
  });

  test('tabela de preços: valor entra na OS e só a administração do laboratório o vê', async () => {
    const semPerfil = await lab
      .put('/laboratorio/tabela-precos')
      .send({ itens: [{ tipo_trabalho: 'Coroa de zircônia', valor: 480 }] });
    expect(semPerfil.status).toBe(403);
    const p = await adml.put('/laboratorio/tabela-precos').send({
      itens: [
        { tipo_trabalho: 'Coroa de zircônia', valor: 480 },
        { tipo_trabalho: 'Coroa de zircônia', valor: 430, cliente_id: externo },
      ],
    });
    expect(p.status).toBe(200);
    expect(p.body).toHaveLength(2);

    const r = await lab
      .post('/ordens-servico')
      .send({ ...corpo(), tipo_trabalho: 'coroa de zircônia', elementos: [14] });
    expect(r.body).not.toHaveProperty('valor');
    expect((await adml.get(`/ordens-servico/${r.body.id}`)).body.valor).toBe(430);

    const propria = await novaOs({ tipo_trabalho: 'Coroa de zircônia' });
    expect(propria).not.toHaveProperty('valor');
    expect((await adml.get(`/ordens-servico/${propria.id}`)).body.valor).toBe(480);
    expect((await sec.get('/ordens-servico/tipos-trabalho')).body).toEqual(
      expect.arrayContaining(['Coroa de zircônia', 'Coroa metalocerâmica']),
    );
  });

  test('edição: laboratório altera a externa; na da clínica só o prazo', async () => {
    const ed = await lab.patch(`/ordens-servico/${ext.id}`).send({ cor: 'B1', material: 'Resina' });
    expect(ed.body).toMatchObject({ cor: 'B1', material: 'Resina' });
    expect(
      (await lab.patch(`/ordens-servico/${ext.id}`).send({ previsao_entrega: null })).status,
    ).toBe(400);

    const propria = await novaOs();
    expect((await lab.patch(`/ordens-servico/${propria.id}`).send({ cor: 'A1' })).status).toBe(403);
    const prazo = await lab
      .patch(`/ordens-servico/${propria.id}`)
      .send({ previsao_entrega: diasAFrente(15) });
    expect(prazo.body.previsao_entrega).toBe(diasAFrente(15));
    // RN-003 continua valendo na edição: não dá para tirar o prazo de uma OS enviada.
    const semPrazo = await lab
      .patch(`/ordens-servico/${propria.id}`)
      .send({ previsao_entrega: null });
    expect(semPrazo.status).toBe(400);
  });

  test('cancelar: motivo obrigatório; técnico depende da permissão; entrega conclui a externa', async () => {
    expect(
      (await lab.post(`/ordens-servico/${ext.id}/cancelar`).send({ motivo: 'Duplicada' })).status,
    ).toBe(403);
    const outra = (await lab.post('/ordens-servico').send(corpo())).body;
    await permitir('cancelar_os', true);
    expect((await lab.post(`/ordens-servico/${outra.id}/cancelar`).send({})).status).toBe(400);
    const c = await lab.post(`/ordens-servico/${outra.id}/cancelar`).send({ motivo: 'Duplicada' });
    expect(c.body).toMatchObject({ status: 'cancelada', motivo_cancelamento: 'Duplicada' });
    expect(
      (await lab.post(`/ordens-servico/${outra.id}/cancelar`).send({ motivo: 'De novo' })).status,
    ).toBe(409);
    const h = await lab.get(`/ordens-servico/${outra.id}/historico`);
    expect(h.body.at(-1)).toMatchObject({
      lado: 'status',
      para_etapa: 'cancelada',
      observacao: 'Duplicada',
    });

    expect((await etapaLab(ext.id, 'entregue')).status).toBe(409);
    await etapaLab(ext.id, 'pronta');
    const fim = await etapaLab(ext.id, 'entregue');
    expect(fim.body).toMatchObject({ status: 'concluida', etapa_producao: 'enviada' });
  });

  test('caderno do cliente: indicadores do mês, em produção e entregues', async () => {
    const c = await lab.get(`/laboratorio/clientes/${externo}`);
    expect(c.status).toBe(200);
    expect(c.body.cliente.razao_social).toBe('Clínica Sorriso Vivo');
    expect(c.body.indicadores).toMatchObject({
      os_abertas: 1,
      entregues_mes: 1,
      no_prazo_pct: 100,
    });
    expect(c.body.entregues.map((o) => o.id)).toEqual([ext.id]);
    expect(c.body.em_producao).toHaveLength(1);
    expect(
      (await lab.get('/laboratorio/clientes/00000000-0000-4000-8000-000000000000')).status,
    ).toBe(404);
  });
});

describe('anexos da OS', () => {
  test('envio cifrado, lista, link de uso único e download; fora do prontuário', async () => {
    const os = await novaOs();
    expect(
      (
        await clin
          .post(`/ordens-servico/${os.id}/anexos`)
          .field('tipo', 'foto')
          .attach('arquivo', PNG, { filename: 'x.png', contentType: 'image/png' })
      ).status,
    ).toBe(403);
    const falso = await lab
      .post(`/ordens-servico/${os.id}/anexos`)
      .field('tipo', 'foto')
      .attach('arquivo', Buffer.from('não é imagem'), {
        filename: 'x.png',
        contentType: 'image/png',
      });
    expect(falso.status).toBe(415);

    const up = await lab
      .post(`/ordens-servico/${os.id}/anexos`)
      .field('tipo', 'foto')
      .attach('arquivo', PNG, { filename: 'modelo de gesso ção.png', contentType: 'image/png' });
    expect(up.status).toBe(201);
    expect(up.body).toMatchObject({
      os_id: os.id,
      nome: 'modelo de gesso ção.png',
      mime: 'image/png',
    });

    const lista = await sec.get(`/ordens-servico/${os.id}/anexos`);
    expect(lista.body).toHaveLength(1);
    // O dentista não alcança o anexo da OS pela rota clínica.
    expect((await clin.get(`/anexos/${up.body.id}`)).status).toBe(404);

    const link = await sec.get(`/ordens-servico/${os.id}/anexos/${up.body.id}`);
    expect(link.body.url).toMatch(/^\/api\/v1\/arquivos\//);
    const baixa = await request(app).get(link.body.url);
    expect(baixa.status).toBe(200);
    expect(Buffer.compare(baixa.body, PNG)).toBe(0);
    expect((await request(app).get(link.body.url)).status).toBe(404);

    const { rows } = await query('SELECT caminho FROM anexos WHERE id = $1', [up.body.id]);
    const noDisco = fs.readFileSync(`${process.env.STORAGE_DIR}/${rows[0].caminho}`);
    expect(noDisco.subarray(0, 4).toString()).toBe('QOA1');
    await esperar();
    const t = await query(
      "SELECT acao FROM auditoria_logs WHERE entidade = 'anexos' AND entidade_id = $1 ORDER BY em",
      [up.body.id],
    );
    expect(t.rows.map((r) => r.acao)).toEqual(['criar', 'link_os', 'download_os']);
  });
});

describe('ligações com o paciente', () => {
  test('resumo do paciente lista as OS em aberto; RN-009 — paciente com OS só é inativado', async () => {
    const r = await sec.get(`/pacientes/${pac}/resumo`);
    expect(r.body.os_em_aberto.length).toBeGreaterThan(0);
    expect(r.body.os_em_aberto[0]).toHaveProperty('numero');

    const novo = (await sec.post('/pacientes').send({ nome: 'Ivo Inativo', cpf: gerarCpf(300002) }))
      .body.id;
    const placa = { paciente_id: novo, tipo_trabalho: 'Placa', previsao_entrega: PRAZO };
    const os = await clin.post('/ordens-servico').send(placa);
    expect(os.status).toBe(201);
    const apagar = await sec.delete(`/pacientes/${novo}`);
    expect(apagar.status).toBe(200);
    expect(apagar.body.acao).toBe('inativado');
    const inativo = await clin.post('/ordens-servico').send(placa);
    expect(inativo.status).toBe(400);
    await query('TRUNCATE ordens_servico CASCADE');
    await query('DELETE FROM pacientes WHERE id = $1', [novo]);
  });
});
