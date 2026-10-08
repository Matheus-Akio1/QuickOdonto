process.env.AUTH_RATE_LIMIT = '1000';

const request = require('supertest');
const bcrypt = require('bcryptjs');
const express = require('express');
const app = require('../src/app');
const { query, pool } = require('../src/config/db');
const { authMiddleware, permitirPerfis, escopoUnidade } = require('../src/middleware/auth');

const SENHA = 'Teste@12345';
const email = (p) => `${p}@auth-test.quickodonto.test`;

async function criarUsuario(prefixo, perfil, unidade) {
  const hash = await bcrypt.hash(SENHA, 4);
  const { rows } = await query(
    `INSERT INTO usuarios (nome, email, senha_hash, perfil, unidade)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [prefixo, email(prefixo), hash, perfil, unidade],
  );
  return rows[0].id;
}

const cookiesDe = (res) => (res.headers['set-cookie'] || []).map((c) => c.split(';')[0]);

beforeAll(async () => {
  await query("DELETE FROM usuarios WHERE email LIKE '%@auth-test.quickodonto.test'");
  await criarUsuario('sec', 'secretaria', 'clinica');
  await criarUsuario('lab', 'laboratorio', 'laboratorio');
  await criarUsuario('bloq', 'secretaria', 'clinica');
});

afterAll(async () => {
  await query("DELETE FROM usuarios WHERE email LIKE '%@auth-test.quickodonto.test'");
  await pool.end();
});

describe('login', () => {
  test('permitido: credenciais corretas abrem sessão com cookies httpOnly', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: email('sec'), senha: SENHA });
    expect(res.status).toBe(200);
    expect(res.body.usuario.perfil).toBe('secretaria');
    expect(JSON.stringify(res.body)).not.toMatch(/senha|hash/i);
    expect(Object.keys(res.body).sort()).toEqual(['csrfToken', 'usuario']);
    const set = res.headers['set-cookie'].join(';');
    expect(set).toMatch(/qo_at=.*HttpOnly.*SameSite=Strict/is);
    expect(set).toMatch(/qo_rt=.*HttpOnly/is);
  });

  test('bloqueado: senha errada e e-mail inexistente dão a mesma resposta genérica', async () => {
    const a = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: email('sec'), senha: 'errada' });
    const b = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'x@y.test', senha: 'errada' });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body).toEqual(b.body);
  });

  test('bloqueado: 5 tentativas inválidas travam a conta (423), mesmo com a senha certa', async () => {
    for (let i = 0; i < 5; i += 1) {
      await request(app)
        .post('/api/v1/auth/login')
        .send({ email: email('bloq'), senha: 'errada' });
    }
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: email('bloq'), senha: SENHA });
    expect(res.status).toBe(423);
  });
});

describe('sessão', () => {
  test('/me: bloqueado sem cookie; permitido com cookie', async () => {
    expect((await request(app).get('/api/v1/auth/me')).status).toBe(401);
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: email('sec'), senha: SENHA });
    const me = await request(app).get('/api/v1/auth/me').set('Cookie', cookiesDe(login));
    expect(me.status).toBe(200);
    expect(me.body.perfil).toBe('secretaria');
    expect(me.headers['cache-control']).toBe('no-store');
    // O front restaura o CSRF por aqui ao recarregar: o token deve existir e valer nas escritas.
    expect(me.body.csrfToken).toBe(login.body.csrfToken);
    const escrita = await request(app)
      .post('/api/v1/auth/logout')
      .set('Cookie', cookiesDe(login))
      .set('X-CSRF-Token', me.body.csrfToken);
    expect(escrita.status).toBe(204);
  });

  test('refresh rotativo: token novo funciona, o antigo é recusado e derruba a sessão', async () => {
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: email('sec'), senha: SENHA });
    const rt = cookiesDe(login).find((c) => c.startsWith('qo_rt='));
    const r1 = await request(app).post('/api/v1/auth/refresh').set('Cookie', [rt]);
    expect(r1.status).toBe(200);
    expect(r1.body.csrfToken).toBeTruthy();
    const novoRt = cookiesDe(r1).find((c) => c.startsWith('qo_rt='));
    expect(novoRt).not.toBe(rt);

    const reuso = await request(app).post('/api/v1/auth/refresh').set('Cookie', [rt]);
    expect(reuso.status).toBe(401);
    const apos = await request(app).post('/api/v1/auth/refresh').set('Cookie', [novoRt]);
    expect(apos.status).toBe(401);
  });

  test('refresh: sessão inativa por mais de 30 min é recusada', async () => {
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: email('sec'), senha: SENHA });
    const rt = cookiesDe(login).find((c) => c.startsWith('qo_rt='));
    await query(
      `UPDATE sessoes SET ultimo_uso = now() - interval '31 minutes'
        WHERE usuario_id = (SELECT id FROM usuarios WHERE email = $1) AND revogada_em IS NULL`,
      [email('sec')],
    );
    expect((await request(app).post('/api/v1/auth/refresh').set('Cookie', [rt])).status).toBe(401);
  });

  test('logout exige CSRF e revoga o refresh', async () => {
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: email('sec'), senha: SENHA });
    const cookies = cookiesDe(login);
    const sem = await request(app).post('/api/v1/auth/logout').set('Cookie', cookies);
    expect(sem.status).toBe(403);
    const com = await request(app)
      .post('/api/v1/auth/logout')
      .set('Cookie', cookies)
      .set('X-CSRF-Token', login.body.csrfToken);
    expect(com.status).toBe(204);
    const rt = cookies.find((c) => c.startsWith('qo_rt='));
    expect((await request(app).post('/api/v1/auth/refresh').set('Cookie', [rt])).status).toBe(401);
  });
});

describe('middlewares permitirPerfis e escopoUnidade', () => {
  const mini = express();
  mini.use(require('cookie-parser')());
  mini.get('/so-clinica', authMiddleware, permitirPerfis(['adm_clinica']), (req, res) =>
    res.json({ ok: 1 }),
  );
  mini.get('/unidade-lab', authMiddleware, escopoUnidade('laboratorio'), (req, res) =>
    res.json({ ok: 1 }),
  );
  mini.get('/vazio', authMiddleware, permitirPerfis([]), (req, res) => res.json({ ok: 1 }));

  let cookies;
  beforeAll(async () => {
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: email('sec'), senha: SENHA });
    cookies = cookiesDe(login);
  });

  test('permitirPerfis: bloqueado para perfil fora da lista (403) e sem login (401)', async () => {
    expect((await request(mini).get('/so-clinica')).status).toBe(401);
    expect((await request(mini).get('/so-clinica').set('Cookie', cookies)).status).toBe(403);
  });

  test('permitirPerfis: permitido para perfil da lista', async () => {
    await criarUsuario('admc', 'adm_clinica', 'clinica');
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: email('admc'), senha: SENHA });
    expect((await request(mini).get('/so-clinica').set('Cookie', cookiesDe(login))).status).toBe(
      200,
    );
  });

  test('permitirPerfis: lista vazia nega todos', async () => {
    expect((await request(mini).get('/vazio').set('Cookie', cookies)).status).toBe(403);
  });

  test('escopoUnidade: clínica barrada na rota do laboratório; laboratório passa', async () => {
    expect((await request(mini).get('/unidade-lab').set('Cookie', cookies)).status).toBe(403);
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: email('lab'), senha: SENHA });
    expect((await request(mini).get('/unidade-lab').set('Cookie', cookiesDe(login))).status).toBe(
      200,
    );
  });
});
