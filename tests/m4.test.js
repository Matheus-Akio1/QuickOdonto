process.env.AUTH_RATE_LIMIT = '1000';

const fs = require('fs');
const path = require('path');
const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const { query, pool } = require('../src/config/db');

const SENHA = 'Teste@12345';
const DOMINIO = '@m4-test.quickodonto.test';
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
    await query("INSERT INTO profissionais (usuario_id, cro) VALUES ($1, 'CRO-SP 4444')", [
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
    cookies,
    csrf: res.body.csrfToken,
    get: com('get'),
    post: com('post'),
    patch: com('patch'),
    delete: com('delete'),
  };
}

// PNG mínimo: assinatura + um chunk qualquer (o servidor confere a assinatura binária).
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('IHDR-dados-de-teste'),
]);
const PDF = Buffer.from('%PDF-1.4\n% documento de teste\n');

let clin;
let clin2;
let semProf;
let sec;
let admc;
let lab;
let pac;
let pacOutro;
let catRest;
let catAval;

beforeAll(async () => {
  await criarUsuario('clin', 'clinica', 'clinica', { profissional: true });
  await criarUsuario('clin2', 'clinica', 'clinica', { profissional: true });
  await criarUsuario('semprof', 'clinica', 'clinica');
  await criarUsuario('sec', 'secretaria', 'clinica');
  await criarUsuario('admc', 'adm_clinica', 'clinica');
  await criarUsuario('lab', 'laboratorio', 'laboratorio');
  [clin, clin2, semProf, sec, admc, lab] = await Promise.all(
    ['clin', 'clin2', 'semprof', 'sec', 'admc', 'lab'].map(entrar),
  );
  pac = (await sec.post('/pacientes').send({ nome: 'Paula Prontuário', cpf: gerarCpf(400001) }))
    .body.id;
  pacOutro = (await sec.post('/pacientes').send({ nome: 'Otávio Outro', cpf: gerarCpf(400002) }))
    .body.id;
  catRest = (
    await admc
      .post('/procedimentos')
      .send({ codigo: 'T-REST', nome: 'Restauração teste', valor_padrao: 220 })
  ).body.id;
  catAval = (
    await clin
      .post('/procedimentos')
      .send({ codigo: 'T-AVAL', nome: 'Avaliação teste', valor_padrao: 100 })
  ).body.id;
});

afterAll(async () => {
  fs.rmSync(process.env.STORAGE_DIR, { recursive: true, force: true });
  await pool.end();
});

describe('autorização do prontuário', () => {
  test('bloqueado: sem login 401; Secretaria, Adm. Clínica e Laboratório não leem conteúdo clínico', async () => {
    expect((await request(app).get(`${V1}/pacientes/${pac}/prontuario`)).status).toBe(401);
    expect((await sec.get(`/pacientes/${pac}/prontuario`)).status).toBe(403);
    expect((await sec.get(`/pacientes/${pac}/evolucoes`)).status).toBe(403);
    expect((await admc.get(`/pacientes/${pac}/prontuario`)).status).toBe(403);
    expect((await admc.get(`/pacientes/${pac}/anamneses`)).status).toBe(403);
    expect((await lab.get(`/pacientes/${pac}/prontuario`)).status).toBe(403);
  });

  test('permitido: dentista lê; dentista sem cadastro de profissional não escreve', async () => {
    expect((await clin.get(`/pacientes/${pac}/prontuario`)).status).toBe(200);
    const r = await semProf
      .post(`/pacientes/${pac}/evolucoes`)
      .send({ conteudo: 'Tentativa sem cadastro' });
    expect(r.status).toBe(403);
    expect(r.body.erro).toMatch(/profissional/);
  });

  test('escrita sem CSRF é barrada', async () => {
    const r = await request(app)
      .post(`${V1}/pacientes/${pac}/evolucoes`)
      .set('Cookie', clin.cookies)
      .send({ conteudo: 'Sem token CSRF' });
    expect(r.status).toBe(403);
  });
});

describe('RF-CLI-015 — registro de acesso ao prontuário', () => {
  test('cada leitura grava quem, quando e o quê; Adm. Clínica consulta a trilha mas não o conteúdo', async () => {
    const antes = (await admc.get(`/pacientes/${pac}/acessos?limite=100`)).body.total;
    await clin.get(`/pacientes/${pac}/prontuario`);
    await clin2.get(`/pacientes/${pac}/anamneses`);
    const depois = await admc.get(`/pacientes/${pac}/acessos?limite=100`);
    expect(depois.status).toBe(200);
    expect(depois.body.total).toBe(antes + 2);
    expect(depois.body.itens.slice(0, 2).map((a) => [a.usuario_nome, a.recurso])).toEqual([
      ['clin2', 'anamneses'],
      ['clin', 'prontuario'],
    ]);
  });

  test('leitura negada (403) ou de paciente inexistente (404) não entra na trilha', async () => {
    const antes = (await admc.get(`/pacientes/${pac}/acessos`)).body.total;
    await sec.get(`/pacientes/${pac}/prontuario`);
    expect(
      (await clin.get('/pacientes/00000000-0000-4000-8000-000000000000/prontuario')).status,
    ).toBe(404);
    expect((await admc.get(`/pacientes/${pac}/acessos`)).body.total).toBe(antes);
  });

  test('a trilha de acesso é imutável no banco', async () => {
    await expect(query("UPDATE acessos_prontuario SET recurso = 'x'")).rejects.toThrow(/RN-006/);
    await expect(query('DELETE FROM acessos_prontuario')).rejects.toThrow(/RN-006/);
  });
});

describe('anamnese versionada (RF-CLI-003)', () => {
  let v1;
  let v2;

  test('cria v1 cifrada no banco e com alertas', async () => {
    const r = await clin.post(`/pacientes/${pac}/anamneses`).send({
      respostas: {
        queixa_principal: 'Dor ao mastigar',
        fumante: false,
        medicamentos: ['Losartana'],
      },
      alertas: [{ tipo: 'alergia', descricao: 'Penicilina' }],
    });
    expect(r.status).toBe(201);
    expect(r.body.versao).toBe(1);
    expect(r.body.assinada_em).toBeNull();
    v1 = r.body.id;
    const { rows } = await query(
      'SELECT respostas_cifrado, alertas_cifrado FROM anamneses WHERE id = $1',
      [v1],
    );
    expect(rows[0].respostas_cifrado).toMatch(/^v1:/);
    expect(rows[0].respostas_cifrado).not.toContain('mastigar');
    expect(rows[0].alertas_cifrado).not.toContain('Penicilina');
  });

  test('nova versão não sobrescreve a anterior; o resumo usa os alertas da última', async () => {
    const r = await clin.post(`/pacientes/${pac}/anamneses`).send({
      respostas: { queixa_principal: 'Sensibilidade ao frio' },
      alertas: [
        { tipo: 'alergia', descricao: 'Penicilina' },
        { tipo: 'condicao', descricao: 'Hipertensão' },
      ],
    });
    expect(r.body.versao).toBe(2);
    v2 = r.body.id;
    const antiga = await clin.get(`/anamneses/${v1}`);
    expect(antiga.body.respostas.queixa_principal).toBe('Dor ao mastigar');
    const lista = await clin.get(`/pacientes/${pac}/anamneses`);
    expect(lista.body.map((a) => a.versao)).toEqual([2, 1]);
    expect(JSON.stringify(lista.body)).not.toMatch(/mastigar|frio/);
    const resumo = await clin.get(`/pacientes/${pac}/prontuario`);
    expect(resumo.body.anamnese_atual.versao).toBe(2);
    expect(resumo.body.alertas.map((a) => a.descricao)).toEqual(['Penicilina', 'Hipertensão']);
  });

  test('assinatura: só o autor, uma única vez', async () => {
    expect((await clin2.post(`/anamneses/${v2}/assinatura`)).status).toBe(403);
    const ok = await clin.post(`/anamneses/${v2}/assinatura`);
    expect(ok.status).toBe(200);
    expect(ok.body.assinada_em).toBeTruthy();
    expect((await clin.post(`/anamneses/${v2}/assinatura`)).status).toBe(409);
  });

  test('o banco recusa alterar conteúdo, "desassinar" ou apagar', async () => {
    await expect(
      query("UPDATE anamneses SET respostas_cifrado = 'x' WHERE id = $1", [v1]),
    ).rejects.toThrow(/nova versão/);
    await expect(
      query('UPDATE anamneses SET assinada_em = NULL WHERE id = $1', [v2]),
    ).rejects.toThrow(/nova versão/);
    await expect(query('DELETE FROM anamneses WHERE id = $1', [v1])).rejects.toThrow(/nova versão/);
  });

  test('validação: tipo de alerta desconhecido e campo extra são recusados', async () => {
    const r1 = await clin
      .post(`/pacientes/${pac}/anamneses`)
      .send({ respostas: {}, alertas: [{ tipo: 'palpite', descricao: 'xx' }] });
    expect(r1.status).toBe(400);
    expect(
      (await clin.post(`/pacientes/${pac}/anamneses`).send({ respostas: {}, extra: 1 })).status,
    ).toBe(400);
  });
});

describe('evoluções e adendos (RN-006)', () => {
  let evo;

  test('registra cifrado, lista decifrado; consulta de outro paciente é recusada', async () => {
    const r = await clin
      .post(`/pacientes/${pac}/evolucoes`)
      .send({ conteudo: 'Restauração classe II no 36, sem intercorrências.' });
    expect(r.status).toBe(201);
    evo = r.body.id;
    const { rows } = await query('SELECT conteudo_cifrado FROM evolucoes WHERE id = $1', [evo]);
    expect(rows[0].conteudo_cifrado).not.toContain('Restauração');
    const lista = await clin.get(`/pacientes/${pac}/evolucoes`);
    expect(lista.body.itens[0]).toMatchObject({
      conteudo: 'Restauração classe II no 36, sem intercorrências.',
      profissional_nome: 'clin',
    });

    const c = await query(
      `INSERT INTO consultas (paciente_id, profissional_id, inicio, fim, status)
       VALUES ($1, (SELECT id FROM profissionais LIMIT 1), now() - interval '2 hours', now() - interval '1 hour', 'concluida')
       RETURNING id`,
      [pacOutro],
    );
    const errada = await clin
      .post(`/pacientes/${pac}/evolucoes`)
      .send({ conteudo: 'Vinculada errado', consulta_id: c.rows[0].id });
    expect(errada.status).toBe(400);
  });

  test('não existe rota de edição/exclusão; correção é por adendo e o original permanece', async () => {
    expect((await clin.patch(`/evolucoes/${evo}`).send({ conteudo: 'x' })).status).toBe(404);
    expect((await clin.delete(`/evolucoes/${evo}`)).status).toBe(404);
    const a = await clin2
      .post(`/evolucoes/${evo}/adendos`)
      .send({ conteudo: 'Correção: dente 37, não 36.' });
    expect(a.status).toBe(201);
    const lista = await clin.get(`/pacientes/${pac}/evolucoes`);
    const e = lista.body.itens.find((i) => i.id === evo);
    expect(e.conteudo).toContain('no 36');
    expect(e.adendos).toEqual([
      expect.objectContaining({
        conteudo: 'Correção: dente 37, não 36.',
        profissional_nome: 'clin2',
      }),
    ]);
  });

  test('o banco recusa UPDATE e DELETE em evoluções e adendos', async () => {
    await expect(
      query("UPDATE evolucoes SET conteudo_cifrado = 'x' WHERE id = $1", [evo]),
    ).rejects.toThrow(/RN-006/);
    await expect(query('DELETE FROM evolucoes WHERE id = $1', [evo])).rejects.toThrow(/RN-006/);
    await expect(query("UPDATE adendos SET conteudo_cifrado = 'x'")).rejects.toThrow(/RN-006/);
  });

  test('auditoria da evolução não guarda o texto clínico', async () => {
    await esperar();
    const aud = await admc.get(`/auditoria?entidade=evolucoes&entidade_id=${evo}`);
    expect(aud.body.itens).toHaveLength(1);
    expect(JSON.stringify(aud.body)).not.toMatch(/Restauração|classe II/);
  });
});

describe('catálogo, procedimentos por dente/face e odontograma', () => {
  let proc;

  test('catálogo: Clínica e Adm. Clínica cadastram; código único; Secretaria não acessa', async () => {
    expect(
      (await admc.post('/procedimentos').send({ codigo: 'T-REST', nome: 'Duplicado' })).status,
    ).toBe(409);
    expect((await sec.get('/procedimentos')).status).toBe(403);
    const lista = await clin.get('/procedimentos?busca=teste');
    expect(lista.body.map((c) => c.codigo).sort()).toEqual(['T-AVAL', 'T-REST']);
    expect(lista.body.find((c) => c.codigo === 'T-REST').valor_padrao).toBe(220);
  });

  test('registra por dente (FDI) e faces; valida dente, face e face sem dente', async () => {
    const r = await clin
      .post(`/pacientes/${pac}/procedimentos`)
      .send({ catalogo_id: catRest, dente: 36, faces: ['O', 'M'], observacao: 'Cárie profunda' });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({
      dente: 36,
      faces: ['O', 'M'],
      status: 'planejado',
      valor: 220,
      observacao: 'Cárie profunda',
    });
    proc = r.body.id;
    expect(
      (await clin.post(`/pacientes/${pac}/procedimentos`).send({ catalogo_id: catRest, dente: 19 }))
        .status,
    ).toBe(400);
    expect(
      (
        await clin
          .post(`/pacientes/${pac}/procedimentos`)
          .send({ catalogo_id: catRest, dente: 36, faces: ['X'] })
      ).status,
    ).toBe(400);
    expect(
      (
        await clin
          .post(`/pacientes/${pac}/procedimentos`)
          .send({ catalogo_id: catRest, faces: ['O'] })
      ).status,
    ).toBe(400);
    expect(
      (await clin.post(`/pacientes/${pac}/procedimentos`).send({ catalogo_id: catRest, dente: 55 }))
        .status,
    ).toBe(201);
  });

  test('transições: planejado → em_andamento → concluído (data automática); depois só adendo', async () => {
    expect(
      (await clin.patch(`/procedimentos-paciente/${proc}`).send({ status: 'em_andamento' })).body
        .status,
    ).toBe('em_andamento');
    const fim = await clin.patch(`/procedimentos-paciente/${proc}`).send({ status: 'concluido' });
    expect(fim.body.status).toBe('concluido');
    expect(fim.body.data).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(fim.body.observacao).toBe('Cárie profunda');

    const edicao = await clin.patch(`/procedimentos-paciente/${proc}`).send({ faces: ['O'] });
    expect(edicao.status).toBe(409);
    expect(edicao.body.erro).toMatch(/adendo/);
    const adendo = await clin
      .patch(`/procedimentos-paciente/${proc}`)
      .send({ adendo: 'Faces corretas: O apenas.' });
    expect(adendo.status).toBe(200);
    expect(adendo.body.faces).toEqual(['O', 'M']);
    expect(adendo.body.adendos.map((a) => a.conteudo)).toEqual(['Faces corretas: O apenas.']);
  });

  test('o banco também recusa alterar ou apagar procedimento concluído', async () => {
    await expect(
      query('UPDATE procedimentos_paciente SET valor = 1 WHERE id = $1', [proc]),
    ).rejects.toThrow(/adendo/);
    await expect(query('DELETE FROM procedimentos_paciente WHERE id = $1', [proc])).rejects.toThrow(
      /excluído/,
    );
  });

  test('transição inválida (cancelado → concluído) é recusada', async () => {
    const p = (
      await clin.post(`/pacientes/${pac}/procedimentos`).send({ catalogo_id: catRest, dente: 11 })
    ).body.id;
    expect(
      (await clin.patch(`/procedimentos-paciente/${p}`).send({ status: 'cancelado' })).status,
    ).toBe(200);
    expect(
      (await clin.patch(`/procedimentos-paciente/${p}`).send({ status: 'concluido' })).status,
    ).toBe(409);
  });

  test('odontograma: situação por dente, ignorando cancelados', async () => {
    const o = await clin.get(`/pacientes/${pac}/odontograma`);
    expect(o.status).toBe(200);
    expect(o.body.dentes['36'].situacao).toBe('concluido');
    expect(o.body.dentes['55'].situacao).toBe('planejado');
    expect(o.body.dentes['11']).toBeUndefined();
  });
});

describe('planos de tratamento', () => {
  test('cria com total calculado no servidor; Adm. Clínica aprova; itens viram procedimentos planejados', async () => {
    const r = await clin.post('/planos-tratamento').send({
      paciente_id: pac,
      observacao: 'Priorizar dor',
      itens: [
        { catalogo_id: catRest, dente: 46, faces: ['O'] },
        { catalogo_id: catAval, valor: 80 },
      ],
    });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ status: 'rascunho', total: 300, observacao: 'Priorizar dor' });
    expect((await sec.post(`/planos-tratamento/${r.body.id}/aprovar`)).status).toBe(403);

    const ap = await admc.post(`/planos-tratamento/${r.body.id}/aprovar`);
    expect(ap.status).toBe(200);
    expect(ap.body.status).toBe('aprovado');
    expect(ap.body.itens.every((i) => i.procedimento_id)).toBe(true);
    expect((await admc.post(`/planos-tratamento/${r.body.id}/aprovar`)).status).toBe(409);

    const procs = await clin.get(`/pacientes/${pac}/procedimentos`);
    const doPlano = procs.body.filter((p) => p.plano_id === r.body.id);
    expect(doPlano.map((p) => [p.catalogo.codigo, p.status, p.valor]).sort()).toEqual([
      ['T-AVAL', 'planejado', 80],
      ['T-REST', 'planejado', 220],
    ]);
    await expect(query('DELETE FROM planos_tratamento WHERE id = $1', [r.body.id])).rejects.toThrow(
      /excluído/,
    );
  });

  test('plano inválido: sem itens, catálogo inexistente', async () => {
    expect(
      (await clin.post('/planos-tratamento').send({ paciente_id: pac, itens: [] })).status,
    ).toBe(400);
    const r = await clin.post('/planos-tratamento').send({
      paciente_id: pac,
      itens: [{ catalogo_id: '00000000-0000-4000-8000-000000000000' }],
    });
    expect(r.status).toBe(400);
  });
});

describe('anexos cifrados e links de uso único', () => {
  let anexo;
  const enviar = (u, buf, opts, tipo = 'radiografia') =>
    request(app)
      .post(`${V1}/pacientes/${pac}/anexos`)
      .set('Cookie', u.cookies)
      .set('X-CSRF-Token', u.csrf)
      .field('tipo', tipo)
      .attach('arquivo', buf, opts);

  test('upload: conteúdo conferido, nome sanitizado e arquivo cifrado no disco', async () => {
    const r = await enviar(clin, PNG, {
      filename: '../../etc/rx-36.png',
      contentType: 'image/png',
    });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({
      tipo: 'radiografia',
      mime: 'image/png',
      nome: 'rx-36.png',
      tamanho: PNG.length,
    });
    expect(r.body.caminho).toBeUndefined();
    anexo = r.body.id;

    const { rows } = await query('SELECT caminho FROM anexos WHERE id = $1', [anexo]);
    const disco = fs.readFileSync(path.join(process.env.STORAGE_DIR, rows[0].caminho));
    expect(disco.subarray(0, 4).toString()).toBe('QOA1');
    expect(disco.includes(Buffer.from('IHDR-dados-de-teste'))).toBe(false);
  });

  test('recusa tipo não aceito e conteúdo que não bate com o tipo declarado', async () => {
    expect(
      (
        await enviar(clin, Buffer.from('#!/bin/sh\nrm -rf /'), {
          filename: 'x.png',
          contentType: 'image/png',
        })
      ).status,
    ).toBe(415);
    expect(
      (await enviar(clin, PDF, { filename: 'laudo.png', contentType: 'image/png' })).status,
    ).toBe(415);
    expect(
      (await enviar(clin, PDF, { filename: 'laudo.pdf', contentType: 'application/pdf' }, 'mp3'))
        .status,
    ).toBe(400);
    expect(
      (await enviar(sec, PDF, { filename: 'laudo.pdf', contentType: 'application/pdf' })).status,
    ).toBe(403);
  });

  test('download: link de uso único devolve o arquivo original uma vez, sem cache', async () => {
    const meta = await clin.get(`/anexos/${anexo}`);
    expect(meta.status).toBe(200);
    expect(meta.body.url).toMatch(/^\/api\/v1\/arquivos\//);
    const baixa = await request(app)
      .get(meta.body.url)
      .buffer(true)
      .parse((res, cb) => {
        const partes = [];
        res.on('data', (d) => partes.push(d));
        res.on('end', () => cb(null, Buffer.concat(partes)));
      });
    expect(baixa.status).toBe(200);
    expect(baixa.headers['content-type']).toBe('image/png');
    expect(baixa.headers['cache-control']).toMatch(/no-store/);
    expect(Buffer.compare(baixa.body, PNG)).toBe(0);
    expect((await request(app).get(meta.body.url)).status).toBe(404);
  });

  test('link expirado não funciona; resgates entram na trilha de acesso', async () => {
    const meta = await clin.get(`/anexos/${anexo}`);
    await query(
      "UPDATE links_download SET expira_em = now() - interval '1 second' WHERE usado_em IS NULL",
    );
    expect((await request(app).get(meta.body.url)).status).toBe(404);
    expect((await request(app).get(`${V1}/arquivos/lixo`)).status).toBe(404);
    const acessos = await admc.get(`/pacientes/${pac}/acessos?limite=100`);
    expect(acessos.body.itens.map((a) => a.recurso)).toEqual(
      expect.arrayContaining(['anexos', 'anexo_link', 'anexo_download']),
    );
  });

  test('anexos não podem ser apagados no banco', async () => {
    await expect(query('DELETE FROM anexos WHERE id = $1', [anexo])).rejects.toThrow(/RN-006/);
  });
});

describe('PDF do prontuário', () => {
  test('gerado no servidor e entregue por link de uso único; acesso registrado', async () => {
    const link = await clin.get(`/pacientes/${pac}/prontuario/pdf`);
    expect(link.status).toBe(200);
    const pdf = await request(app)
      .get(link.body.url)
      .buffer(true)
      .parse((res, cb) => {
        const partes = [];
        res.on('data', (d) => partes.push(d));
        res.on('end', () => cb(null, Buffer.concat(partes)));
      });
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect(pdf.headers['content-disposition']).toMatch(/^attachment/);
    expect(pdf.body.subarray(0, 5).toString()).toBe('%PDF-');
    expect((await request(app).get(link.body.url)).status).toBe(404);
    const acessos = await admc.get(`/pacientes/${pac}/acessos?limite=5`);
    expect(acessos.body.itens[0].recurso).toBe('pdf');
    expect((await sec.get(`/pacientes/${pac}/prontuario/pdf`)).status).toBe(403);
  });
});

describe('RN-009 com prontuário', () => {
  test('paciente com registro clínico só é inativado; o banco impede apagar', async () => {
    const del = await sec.delete(`/pacientes/${pac}`);
    expect(del.body.acao).toBe('inativado');
    await expect(query('DELETE FROM pacientes WHERE id = $1', [pac])).rejects.toThrow(
      /foreign key|violates/,
    );
  });

  test('linha do tempo junta evolução, anamnese, procedimento e anexo', async () => {
    const r = await clin.get(`/pacientes/${pac}/prontuario`);
    const tipos = new Set(r.body.linha_do_tempo.map((i) => i.tipo));
    expect([...tipos].sort()).toEqual(['anamnese', 'anexo', 'evolucao', 'procedimento']);
  });
});
