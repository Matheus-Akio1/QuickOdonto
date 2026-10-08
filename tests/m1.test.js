process.env.AUTH_RATE_LIMIT = '1000';

jest.mock('../src/lib/mailer', () => ({ enviarEmail: jest.fn().mockResolvedValue(undefined) }));

const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const { query, pool } = require('../src/config/db');
const { enviarEmail } = require('../src/lib/mailer');

const SENHA = 'Teste@12345';
const DOMINIO = '@m1-test.quickodonto.test';
const email = (p) => `${p}${DOMINIO}`;
const V1 = '/api/v1';

async function criarUsuario(prefixo, perfil, unidade, extra = {}) {
  const hash = await bcrypt.hash(SENHA, 4);
  const { rows } = await query(
    `INSERT INTO usuarios (nome, email, senha_hash, perfil, unidade, status)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [prefixo, email(prefixo), hash, perfil, unidade, extra.status || 'ativo'],
  );
  return rows[0].id;
}

/** Faz login e devolve um "agente" que já manda cookies e o header CSRF. */
async function entrar(prefixo) {
  const res = await request(app)
    .post(`${V1}/auth/login`)
    .send({ email: email(prefixo), senha: SENHA });
  expect(res.status).toBe(200);
  const cookies = (res.headers['set-cookie'] || []).map((c) => c.split(';')[0]);
  const csrf = res.body.csrfToken;
  const com = (m) => (url) =>
    request(app)[m](`${V1}${url}`).set('Cookie', cookies).set('X-CSRF-Token', csrf);
  return {
    cookies,
    csrf,
    get: com('get'),
    post: com('post'),
    patch: com('patch'),
    put: com('put'),
  };
}

const tokenDoUltimoEmail = () => {
  const { texto } = enviarEmail.mock.calls.at(-1)[0];
  return /redefinir-senha\/(\S+)/.exec(texto)[1];
};
const esperarAuditoria = () => new Promise((r) => setTimeout(r, 150));

let ids;
beforeAll(async () => {
  await query('DELETE FROM usuarios WHERE email LIKE $1', [`%${DOMINIO}`]);
  ids = {
    admc: await criarUsuario('admc', 'adm_clinica', 'clinica'),
    admc2: await criarUsuario('admc2', 'adm_clinica', 'clinica'),
    adml: await criarUsuario('adml', 'adm_laboratorio', 'laboratorio'),
    sec: await criarUsuario('sec', 'secretaria', 'clinica'),
    lab: await criarUsuario('lab', 'laboratorio', 'laboratorio'),
  };
});

afterAll(async () => {
  await query('DELETE FROM usuarios WHERE email LIKE $1', [`%${DOMINIO}`]);
  await pool.end();
});

beforeEach(() => enviarEmail.mockClear());

describe('CSRF', () => {
  test('bloqueado: escrita com cookie e sem X-CSRF-Token (403) ou com token errado (403)', async () => {
    const a = await entrar('admc');
    const sem = await request(app).post(`${V1}/usuarios`).set('Cookie', a.cookies).send({});
    expect(sem.status).toBe(403);
    const errado = await request(app)
      .post(`${V1}/usuarios`)
      .set('Cookie', a.cookies)
      .set('X-CSRF-Token', 'x'.repeat(43))
      .send({});
    expect(errado.status).toBe(403);
  });

  test('permitido: com o token do login a escrita passa pela barreira (chega à validação: 400)', async () => {
    const a = await entrar('admc');
    expect((await a.post('/usuarios').send({})).status).toBe(400);
  });

  test('permitido: leitura (GET) não exige CSRF', async () => {
    const a = await entrar('admc');
    expect((await request(app).get(`${V1}/usuarios`).set('Cookie', a.cookies)).status).toBe(200);
  });
});

describe('/usuarios — autorização e escopo', () => {
  test('bloqueado: sem login 401; secretaria e técnico de laboratório 403', async () => {
    expect((await request(app).get(`${V1}/usuarios`)).status).toBe(401);
    expect((await (await entrar('sec')).get('/usuarios')).status).toBe(403);
    expect((await (await entrar('lab')).get('/usuarios')).status).toBe(403);
  });

  test('RN-014: lista só mostra usuários da própria unidade', async () => {
    const c = await (await entrar('admc')).get('/usuarios?limite=100');
    expect(c.status).toBe(200);
    expect(c.body.itens.length).toBeGreaterThan(0);
    expect(c.body.itens.every((u) => u.unidade === 'clinica')).toBe(true);
    expect(JSON.stringify(c.body)).not.toMatch(/senha|hash/i);
    const l = await (await entrar('adml')).get('/usuarios?limite=100');
    expect(l.body.itens.every((u) => u.unidade === 'laboratorio')).toBe(true);
  });

  test('RN-014: administrador não vê, edita nem bloqueia usuário de outra unidade (404)', async () => {
    const a = await entrar('admc');
    expect((await a.get(`/usuarios/${ids.lab}`)).status).toBe(404);
    expect((await a.patch(`/usuarios/${ids.lab}`).send({ nome: 'Invasor' })).status).toBe(404);
    expect((await a.post(`/usuarios/${ids.lab}/bloquear`).send()).status).toBe(404);
  });
});

describe('/usuarios — ciclo de vida', () => {
  let novoId;

  test('cria convidado, valida perfil da unidade, e-mail único e envia convite', async () => {
    const a = await entrar('admc');
    expect(
      (
        await a
          .post('/usuarios')
          .send({ nome: 'Fulano', email: email('novo'), perfil: 'laboratorio' })
      ).status,
    ).toBe(400);

    const ok = await a
      .post('/usuarios')
      .send({ nome: 'Fulano', email: email('novo'), perfil: 'secretaria' });
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({
      status: 'convidado',
      unidade: 'clinica',
      perfil: 'secretaria',
    });
    expect(ok.body.senha_hash).toBeUndefined();
    novoId = ok.body.id;

    expect(enviarEmail).toHaveBeenCalledTimes(1);
    expect(enviarEmail.mock.calls[0][0].para).toBe(email('novo'));

    const dup = await a
      .post('/usuarios')
      .send({ nome: 'Fulano', email: email('novo'), perfil: 'secretaria' });
    expect(dup.status).toBe(409);
  });

  test('convidado não loga; define a senha pelo link (uso único) e passa a logar', async () => {
    const tentativa = await request(app)
      .post(`${V1}/auth/login`)
      .send({ email: email('novo'), senha: SENHA });
    expect(tentativa.status).toBe(401);

    const a = await entrar('admc');
    enviarEmail.mockClear();
    expect((await a.post(`/usuarios/${novoId}/redefinir-senha`).send()).status).toBe(204);
    const token = tokenDoUltimoEmail();

    const fraca = await request(app)
      .post(`${V1}/auth/redefinir-senha`)
      .send({ token, novaSenha: 'curta' });
    expect(fraca.status).toBe(400);
    const ok = await request(app)
      .post(`${V1}/auth/redefinir-senha`)
      .send({ token, novaSenha: 'NovaSenha#2026' });
    expect(ok.status).toBe(204);
    const reuso = await request(app)
      .post(`${V1}/auth/redefinir-senha`)
      .send({ token, novaSenha: 'OutraSenha#2026' });
    expect(reuso.status).toBe(400);

    const login = await request(app)
      .post(`${V1}/auth/login`)
      .send({ email: email('novo'), senha: 'NovaSenha#2026' });
    expect(login.status).toBe(200);
  });

  test('token de redefinição expirado é recusado', async () => {
    await request(app)
      .post(`${V1}/auth/esqueci-senha`)
      .send({ email: email('sec') });
    const token = tokenDoUltimoEmail();
    await query(
      "UPDATE tokens_senha SET expira_em = now() - interval '1 minute' WHERE usuario_id = $1",
      [ids.sec],
    );
    const res = await request(app)
      .post(`${V1}/auth/redefinir-senha`)
      .send({ token, novaSenha: 'NovaSenha#2026' });
    expect(res.status).toBe(400);
  });

  test('esqueci-senha: resposta igual para e-mail existente e inexistente; só o existente recebe e-mail', async () => {
    const a = await request(app)
      .post(`${V1}/auth/esqueci-senha`)
      .send({ email: email('sec') });
    expect(enviarEmail).toHaveBeenCalledTimes(1);
    enviarEmail.mockClear();
    const b = await request(app).post(`${V1}/auth/esqueci-senha`).send({ email: 'ninguem@x.test' });
    expect(a.status).toBe(204);
    expect(b.status).toBe(204);
    expect(enviarEmail).not.toHaveBeenCalled();
  });

  test('redefinir senha derruba as sessões abertas do usuário', async () => {
    const sec = await entrar('sec');
    await request(app)
      .post(`${V1}/auth/esqueci-senha`)
      .send({ email: email('sec') });
    const token = tokenDoUltimoEmail();
    await request(app).post(`${V1}/auth/redefinir-senha`).send({ token, novaSenha: SENHA });
    const rt = sec.cookies.find((c) => c.startsWith('qo_rt='));
    expect((await request(app).post(`${V1}/auth/refresh`).set('Cookie', [rt])).status).toBe(401);
  });

  test('edita nome/perfil; não altera o próprio perfil; e-mail duplicado 409', async () => {
    const a = await entrar('admc');
    const ed = await a
      .patch(`/usuarios/${novoId}`)
      .send({ nome: 'Fulano Editado', perfil: 'clinica' });
    expect(ed.status).toBe(200);
    expect(ed.body).toMatchObject({ nome: 'Fulano Editado', perfil: 'clinica' });
    expect((await a.patch(`/usuarios/${ids.admc}`).send({ perfil: 'secretaria' })).status).toBe(
      400,
    );
    expect((await a.patch(`/usuarios/${novoId}`).send({ email: email('sec') })).status).toBe(409);
    expect((await a.patch(`/usuarios/${novoId}`).send({})).status).toBe(400);
  });
});

describe('bloquear / desbloquear', () => {
  test('fluxo completo', async () => {
    const a = await entrar('admc');
    const alvo = await entrar('sec');

    expect((await a.post(`/usuarios/${ids.admc}/bloquear`).send()).status).toBe(400);
    const b = await a.post(`/usuarios/${ids.sec}/bloquear`).send();
    expect(b.status).toBe(200);
    expect(b.body.status).toBe('bloqueado');

    expect((await request(app).get(`${V1}/auth/me`).set('Cookie', alvo.cookies)).status).toBe(401);
    const rt = alvo.cookies.find((c) => c.startsWith('qo_rt='));
    expect((await request(app).post(`${V1}/auth/refresh`).set('Cookie', [rt])).status).toBe(401);
    expect(
      (
        await request(app)
          .post(`${V1}/auth/login`)
          .send({ email: email('sec'), senha: SENHA })
      ).status,
    ).toBe(401);

    expect((await a.post(`/usuarios/${ids.sec}/desbloquear`).send()).status).toBe(200);
    expect((await a.post(`/usuarios/${ids.sec}/desbloquear`).send()).status).toBe(400);
    expect(
      (
        await request(app)
          .post(`${V1}/auth/login`)
          .send({ email: email('sec'), senha: SENHA })
      ).status,
    ).toBe(200);
  });
});

describe('/perfis/:perfil/permissoes', () => {
  test('bloqueado: perfis sem permissão 403; adm da clínica não vê o perfil do laboratório (404)', async () => {
    expect((await (await entrar('sec')).get('/perfis/laboratorio/permissoes')).status).toBe(403);
    expect((await (await entrar('admc')).get('/perfis/laboratorio/permissoes')).status).toBe(404);
  });

  test('permitido: AL lê, altera, e /auth/me do técnico reflete; chave desconhecida 400', async () => {
    const al = await entrar('adml');
    const antes = await al.get('/perfis/laboratorio/permissoes');
    expect(antes.status).toBe(200);
    expect(antes.body.permissoes).toEqual({
      entrada_estoque: false,
      criar_os_externa: false,
      cancelar_os: false,
    });

    expect(
      (await al.put('/perfis/laboratorio/permissoes').send({ permissoes: { hackear: true } }))
        .status,
    ).toBe(400);
    const up = await al
      .put('/perfis/laboratorio/permissoes')
      .send({ permissoes: { entrada_estoque: true } });
    expect(up.status).toBe(200);
    expect(up.body.permissoes.entrada_estoque).toBe(true);

    const me = await (await entrar('lab')).get('/auth/me');
    expect(me.body.permissoes.entrada_estoque).toBe(true);
  });
});

describe('auditoria', () => {
  test('escritas gravam antes/depois sem dado sensível; leitura escopada por unidade; AC não vê a do laboratório', async () => {
    const a = await entrar('admc');
    await a.patch(`/usuarios/${ids.admc2}`).send({ nome: 'Admc2 Editado' });
    await esperarAuditoria();

    const res = await a.get(`/auditoria?entidade=usuarios&entidade_id=${ids.admc2}`);
    expect(res.status).toBe(200);
    const reg = res.body.itens.find((i) => i.acao === 'editar');
    expect(reg).toBeTruthy();
    expect(reg.antes.nome).toBe('admc2');
    expect(reg.depois.nome).toBe('Admc2 Editado');
    expect(JSON.stringify(res.body)).not.toMatch(/senha|hash|token/i);

    const lab = await (await entrar('adml')).get(`/auditoria?entidade_id=${ids.admc2}`);
    expect(lab.body.itens).toHaveLength(0);
    expect((await (await entrar('sec')).get('/auditoria')).status).toBe(403);
  });

  test('trilha é imutável: UPDATE e DELETE direto no banco falham', async () => {
    await expect(query("UPDATE auditoria_logs SET acao = 'x'")).rejects.toThrow(/somente inserção/);
    await expect(query('DELETE FROM auditoria_logs')).rejects.toThrow(/somente inserção/);
  });

  test('falha (4xx) não gera registro de auditoria', async () => {
    const a = await entrar('admc');
    const antes = (await a.get('/auditoria?entidade=usuarios&limite=100')).body.total;
    await a.post('/usuarios').send({ nome: 'x', email: 'invalido', perfil: 'secretaria' });
    await esperarAuditoria();
    expect((await a.get('/auditoria?entidade=usuarios&limite=100')).body.total).toBe(antes);
  });
});

describe('/notificacoes', () => {
  test('lista só as do próprio usuário e marca como lida; de outro usuário dá 404', async () => {
    await query(
      "INSERT INTO notificacoes (usuario_id, tipo, titulo) VALUES ($1,'teste','Para a secretaria')",
      [ids.sec],
    );
    await query(
      "INSERT INTO notificacoes (usuario_id, tipo, titulo) VALUES ($1,'teste','Para o lab')",
      [ids.lab],
    );

    expect((await request(app).get(`${V1}/notificacoes`)).status).toBe(401);

    const sec = await entrar('sec');
    const lista = await sec.get('/notificacoes');
    expect(lista.status).toBe(200);
    expect(lista.body.itens.map((n) => n.titulo)).toEqual(['Para a secretaria']);
    expect(lista.body.nao_lidas).toBe(1);

    const outra = await query('SELECT id FROM notificacoes WHERE usuario_id = $1', [ids.lab]);
    expect((await sec.patch(`/notificacoes/${outra.rows[0].id}/lida`).send()).status).toBe(404);

    expect((await sec.patch(`/notificacoes/${lista.body.itens[0].id}/lida`).send()).status).toBe(
      204,
    );
    expect((await sec.get('/notificacoes?nao_lidas=true')).body.itens).toHaveLength(0);
  });
});
