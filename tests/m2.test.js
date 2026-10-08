process.env.AUTH_RATE_LIMIT = '1000';

const request = require('supertest');
const bcrypt = require('bcryptjs');
const ExcelJS = require('exceljs');
const app = require('../src/app');
const { query, pool } = require('../src/config/db');

const SENHA = 'Teste@12345';
const DOMINIO = '@m2-test.quickodonto.test';
const email = (p) => `${p}${DOMINIO}`;
const V1 = '/api/v1';

const DATA = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
const t = (h, m = 0) =>
  `${DATA}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00-03:00`;

function gerarCpf(base) {
  const d = String(base).padStart(9, '0').split('').map(Number);
  const dv = (arr) => {
    const soma = arr.reduce((acc, n, i) => acc + n * (arr.length + 1 - i), 0);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  d.push(dv(d));
  d.push(dv(d));
  return d.join('');
}

async function criarUsuario(prefixo, perfil, unidade) {
  const hash = await bcrypt.hash(SENHA, 4);
  const { rows } = await query(
    'INSERT INTO usuarios (nome, email, senha_hash, perfil, unidade) VALUES ($1,$2,$3,$4,$5) RETURNING id',
    [prefixo, email(prefixo), hash, perfil, unidade],
  );
  return rows[0].id;
}

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
    get: com('get'),
    post: com('post'),
    patch: com('patch'),
    put: com('put'),
    delete: com('delete'),
  };
}

const esperar = () => new Promise((r) => setTimeout(r, 200));

let sec, clin, admc, lab, ids, prof1, prof2, pac1, pac2;
let seqCpf = 100000;
const novoCpf = () => gerarCpf(seqCpf++);

beforeAll(async () => {
  await query('DELETE FROM usuarios WHERE email LIKE $1', [`%${DOMINIO}`]);
  await query('DELETE FROM pacientes');
  ids = {
    sec: await criarUsuario('sec', 'secretaria', 'clinica'),
    clin: await criarUsuario('clin', 'clinica', 'clinica'),
    admc: await criarUsuario('admc', 'adm_clinica', 'clinica'),
    lab: await criarUsuario('lab', 'laboratorio', 'laboratorio'),
    dent1: await criarUsuario('dent1', 'clinica', 'clinica'),
    dent2: await criarUsuario('dent2', 'clinica', 'clinica'),
  };
  [sec, clin, admc, lab] = await Promise.all(['sec', 'clin', 'admc', 'lab'].map(entrar));

  const jornada = {
    horarios: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ dia_semana: d, inicio: '08:00', fim: '18:00' })),
  };
  const p1 = await admc.post('/profissionais').send({ usuario_id: ids.dent1, cro: 'CRO-SP 11111' });
  const p2 = await admc
    .post('/profissionais')
    .send({ usuario_id: ids.dent2, cro: 'CRO-SP 22222', cor_agenda: '#aa3355' });
  prof1 = p1.body.id;
  prof2 = p2.body.id;
  await admc.put(`/profissionais/${prof1}/horarios`).send(jornada);
  await admc.put(`/profissionais/${prof2}/horarios`).send(jornada);

  const a = await sec
    .post('/pacientes')
    .send({ nome: 'Ana Agenda', cpf: novoCpf(), celular: '11987654321' });
  const b = await sec.post('/pacientes').send({ nome: 'Bruno Agenda', cpf: novoCpf() });
  pac1 = a.body.id;
  pac2 = b.body.id;
});

afterAll(async () => {
  await query('DELETE FROM consultas');
  await query('DELETE FROM pacientes');
  await query('DELETE FROM bloqueios_agenda');
  await query('DELETE FROM profissionais');
  await query('DELETE FROM usuarios WHERE email LIKE $1', [`%${DOMINIO}`]);
  await pool.end();
});

describe('pacientes — autorização e escopo', () => {
  test('bloqueado: sem login 401; Adm. Clínica e Laboratório 403; dentista lê mas não cadastra', async () => {
    expect((await request(app).get(`${V1}/pacientes`)).status).toBe(401);
    expect((await admc.get('/pacientes')).status).toBe(403);
    expect((await lab.get('/pacientes')).status).toBe(403);
    expect((await clin.get('/pacientes')).status).toBe(200);
    expect((await clin.post('/pacientes').send({ nome: 'X Y', cpf: novoCpf() })).status).toBe(403);
    expect((await clin.delete(`/pacientes/${pac1}`)).status).toBe(403);
  });

  test('respostas com dado pessoal não são cacheadas', async () => {
    expect((await sec.get('/pacientes')).headers['cache-control']).toBe('no-store');
  });
});

describe('pacientes — cadastro, criptografia e máscaras', () => {
  let id;
  const cpf = novoCpf();

  test('cria com nº de prontuário; CPF/celular saem mascarados; nada sensível no JSON', async () => {
    const res = await sec.post('/pacientes').send({
      nome: 'Carla Cadastro',
      cpf,
      celular: '(21) 99888-7766',
      email: 'CARLA@exemplo.test',
      nascimento: '1990-05-17',
      sexo: 'F',
      endereco: { cep: '01001-000', cidade: 'São Paulo', uf: 'SP' },
      observacoes: 'Paciente ansiosa, prefere manhãs',
    });
    expect(res.status).toBe(201);
    id = res.body.id;
    expect(res.body.numero_prontuario).toBeGreaterThan(0);
    expect(res.body.cpf).toBe(`***.***.***-${cpf.slice(9)}`);
    expect(res.body.celular).toBe('(21) *****-7766');
    expect(res.body.email).toBe('carla@exemplo.test');
    const json = JSON.stringify(res.body);
    expect(json).not.toContain(cpf);
    expect(json).not.toContain('998887766');
    expect(json).not.toMatch(/cifrado|cpf_hash/);
  });

  test('no banco: CPF e observações cifrados, hash preenchido, celular só com dígitos', async () => {
    const { rows } = await query('SELECT * FROM pacientes WHERE id = $1', [id]);
    const p = rows[0];
    expect(p.cpf_cifrado).not.toContain(cpf);
    expect(p.cpf_cifrado.startsWith('v1:')).toBe(true);
    expect(p.cpf_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(p.observacoes_cifrado).not.toContain('ansiosa');
    expect(p.celular).toBe('21998887766');
  });

  test('ficha traz observações decifradas e endereço; lista não traz observações', async () => {
    const ficha = await sec.get(`/pacientes/${id}`);
    expect(ficha.body.observacoes).toBe('Paciente ansiosa, prefere manhãs');
    expect(ficha.body.endereco.cidade).toBe('São Paulo');
    const lista = await sec.post('/pacientes/buscar').send({ busca: 'Carla' });
    expect(lista.body.itens[0].observacoes).toBeUndefined();
    expect(lista.body.itens[0].endereco).toBeUndefined();
  });

  test('RN-001: CPF inválido 400; duplicado (mesmo com pontuação) 409; sem CPF exige responsável', async () => {
    expect(
      (await sec.post('/pacientes').send({ nome: 'Dani Dup', cpf: '11111111111' })).status,
    ).toBe(400);
    const fmt = `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
    expect((await sec.post('/pacientes').send({ nome: 'Dani Dup', cpf: fmt })).status).toBe(409);
    expect((await sec.post('/pacientes').send({ nome: 'Sem Cpf' })).status).toBe(400);
    const menor = await sec.post('/pacientes').send({
      nome: 'Menor Edu',
      nascimento: '2018-01-10',
      responsavel_nome: 'Mãe do Edu',
      responsavel_parentesco: 'mãe',
      responsavel_celular: '11911112222',
    });
    expect(menor.status).toBe(201);
    expect(menor.body.cpf).toBeNull();
    expect(menor.body.responsavel.celular).toBe('(11) *****-2222');
  });

  test('validação: campo desconhecido, celular curto e nascimento futuro são recusados', async () => {
    expect(
      (await sec.post('/pacientes').send({ nome: 'Val Id', cpf: novoCpf(), admin: true })).status,
    ).toBe(400);
    expect(
      (await sec.post('/pacientes').send({ nome: 'Val Id', cpf: novoCpf(), celular: '123' }))
        .status,
    ).toBe(400);
    expect(
      (
        await sec
          .post('/pacientes')
          .send({ nome: 'Val Id', cpf: novoCpf(), nascimento: '2999-01-01' })
      ).status,
    ).toBe(400);
  });

  test('PATCH: edita; remover o CPF sem responsável é recusado; CPF de outro paciente 409', async () => {
    const ok = await sec
      .patch(`/pacientes/${id}`)
      .send({ celular: '11955554444', origem: 'Indicação' });
    expect(ok.status).toBe(200);
    expect(ok.body.celular).toBe('(11) *****-4444');
    expect((await sec.patch(`/pacientes/${id}`).send({ cpf: null })).status).toBe(400);
    const outro = await sec.get(`/pacientes/${pac1}`);
    expect(outro.status).toBe(200);
    const { rows } = await query('SELECT cpf_cifrado FROM pacientes WHERE id = $1', [pac1]);
    const { decifrar } = require('../src/lib/crypto');
    expect(
      (await sec.patch(`/pacientes/${id}`).send({ cpf: decifrar(rows[0].cpf_cifrado) })).status,
    ).toBe(409);
    expect((await sec.patch(`/pacientes/${id}`).send({})).status).toBe(400);
  });

  test('busca pela URL é recusada: o termo (que pode ser CPF) só vai no corpo', async () => {
    const r = await sec.get(`/pacientes?busca=${cpf}`);
    expect(r.status).toBe(400);
    expect(r.body.erro).toMatch(/buscar/);
    expect((await sec.post('/pacientes/buscar').send({})).status).toBe(400);
    expect((await admc.post('/pacientes/buscar').send({ busca: 'x' })).status).toBe(403);
  });

  test('busca por nome, por CPF completo (formatado ou não) e por parte do celular', async () => {
    const porNome = await sec.post('/pacientes/buscar').send({ busca: 'carla' });
    expect(porNome.body.itens.map((p) => p.id)).toContain(id);
    const porCpf = await sec.post('/pacientes/buscar').send({ busca: cpf });
    expect(porCpf.body.itens.map((p) => p.id)).toEqual([id]);
    const fmt = `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
    expect(
      (await sec.post('/pacientes/buscar').send({ busca: fmt })).body.itens.map((p) => p.id),
    ).toEqual([id]);
    const porCel = await sec.post('/pacientes/buscar').send({ busca: '55554444' });
    expect(porCel.body.itens.map((p) => p.id)).toContain(id);
    expect((await sec.post('/pacientes/buscar').send({ busca: '%' })).body.total).toBe(0);
  });

  test('revelar CPF exige perfil, devolve o valor completo e fica na auditoria sem o valor', async () => {
    expect((await admc.get(`/pacientes/${id}/revelar/cpf`)).status).toBe(403);
    expect((await sec.get(`/pacientes/${id}/revelar/endereco`)).status).toBe(400);
    const res = await sec.get(`/pacientes/${id}/revelar/cpf`);
    expect(res.status).toBe(200);
    expect(res.body.valor).toBe(cpf);
    await esperar();
    const aud = await admc.get(`/auditoria?entidade=pacientes&entidade_id=${id}`);
    expect(aud.body.itens.map((i) => i.acao)).toEqual(
      expect.arrayContaining(['criar', 'editar', 'revelar_cpf']),
    );
    expect(JSON.stringify(aud.body)).not.toContain(cpf);
    expect(JSON.stringify(aud.body)).not.toContain('998887766');
  });

  test('consentimento LGPD: registra, aparece na ficha; forma inválida 400', async () => {
    const ok = await sec
      .post(`/pacientes/${id}/consentimento`)
      .send({ finalidade: 'Tratamento odontológico', forma: 'presencial' });
    expect(ok.status).toBe(201);
    expect(
      (
        await sec
          .post(`/pacientes/${id}/consentimento`)
          .send({ finalidade: 'Tratamento', forma: 'telepatia' })
      ).status,
    ).toBe(400);
    expect(
      (
        await clin
          .post(`/pacientes/${id}/consentimento`)
          .send({ finalidade: 'Tratamento', forma: 'digital' })
      ).status,
    ).toBe(403);
    const ficha = await sec.get(`/pacientes/${id}`);
    expect(ficha.body.consentimentos).toHaveLength(1);
  });

  test('id malformado e inexistente dão 404', async () => {
    expect((await sec.get('/pacientes/abc')).status).toBe(404);
    expect((await sec.get('/pacientes/00000000-0000-4000-8000-000000000000')).status).toBe(404);
  });
});

describe('pacientes — RN-009 e exportação', () => {
  test('sem histórico: exclusão física; com histórico: só inativa e some da lista padrão', async () => {
    const sem = await sec.post('/pacientes').send({ nome: 'Sem Historico', cpf: novoCpf() });
    const del = await sec.delete(`/pacientes/${sem.body.id}`);
    expect(del.body.acao).toBe('excluido');
    expect((await sec.get(`/pacientes/${sem.body.id}`)).status).toBe(404);

    const com = await sec.post('/pacientes').send({ nome: 'Com Historico', cpf: novoCpf() });
    const c = await sec.post('/consultas').send({
      paciente_id: com.body.id,
      profissional_id: prof1,
      inicio: t(16),
      fim: t(16, 30),
    });
    expect(c.status).toBe(201);
    expect((await sec.delete(`/pacientes/${com.body.id}`)).body.acao).toBe('inativado');
    expect((await sec.post('/pacientes/buscar').send({ busca: 'Com Historico' })).body.total).toBe(
      0,
    );
    expect(
      (await sec.post('/pacientes/buscar').send({ busca: 'Com Historico', ativo: 'todos' })).body
        .total,
    ).toBe(1);
    const nova = await sec.post('/consultas').send({
      paciente_id: com.body.id,
      profissional_id: prof1,
      inicio: t(17),
      fim: t(17, 30),
    });
    expect(nova.status).toBe(400);
  });

  test('exportar xlsx: só Secretaria, mascarado e auditado', async () => {
    expect((await clin.get('/pacientes/exportar?formato=xlsx')).status).toBe(403);
    expect((await sec.get('/pacientes/exportar?formato=csv')).status).toBe(400);
    const res = await sec
      .get('/pacientes/exportar?formato=xlsx')
      .buffer(true)
      .parse((r, cb) => {
        const partes = [];
        r.on('data', (d) => partes.push(d));
        r.on('end', () => cb(null, Buffer.concat(partes)));
      });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/spreadsheetml/);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body);
    const ws = wb.getWorksheet('Pacientes');
    expect(ws.rowCount).toBeGreaterThan(1);
    const cpfsCelulas = [];
    ws.eachRow((row, n) => n > 1 && cpfsCelulas.push(row.getCell(3).value));
    expect(cpfsCelulas.every((v) => v === null || /^\*\*\*\.\*\*\*\.\*\*\*-\d\d$/.test(v))).toBe(
      true,
    );
    await esperar();
    const aud = await admc.get('/auditoria?entidade=pacientes');
    expect(aud.body.itens.some((i) => i.acao === 'exportar')).toBe(true);
  });
});

describe('profissionais e jornada', () => {
  test('somente Adm. Clínica escreve; Secretaria e dentista leem; perfil errado não vira profissional', async () => {
    expect((await sec.get('/profissionais')).status).toBe(200);
    expect((await clin.get('/profissionais')).status).toBe(200);
    expect((await lab.get('/profissionais')).status).toBe(403);
    expect(
      (await sec.post('/profissionais').send({ usuario_id: ids.dent1, cro: 'CRO-SP 1' })).status,
    ).toBe(403);
    expect(
      (await admc.post('/profissionais').send({ usuario_id: ids.sec, cro: 'CRO-SP 33333' })).status,
    ).toBe(400);
    expect(
      (await admc.post('/profissionais').send({ usuario_id: ids.dent1, cro: 'CRO-SP 11111' }))
        .status,
    ).toBe(409);
    const lista = await sec.get('/profissionais');
    expect(lista.body.map((p) => p.nome).sort()).toEqual(['dent1', 'dent2']);
  });

  test('jornada: janelas sobrepostas e horário inválido são recusados; leitura devolve HH:MM', async () => {
    const sobre = await admc.put(`/profissionais/${prof1}/horarios`).send({
      horarios: [
        { dia_semana: 1, inicio: '08:00', fim: '12:00' },
        { dia_semana: 1, inicio: '11:00', fim: '14:00' },
      ],
    });
    expect(sobre.status).toBe(400);
    expect(
      (
        await admc
          .put(`/profissionais/${prof1}/horarios`)
          .send({ horarios: [{ dia_semana: 9, inicio: '08:00', fim: '12:00' }] })
      ).status,
    ).toBe(400);
    expect(
      (
        await admc
          .put(`/profissionais/${prof1}/horarios`)
          .send({ horarios: [{ dia_semana: 1, inicio: '12:00', fim: '08:00' }] })
      ).status,
    ).toBe(400);
    const lista = await sec.get(`/profissionais/${prof1}/horarios`);
    expect(lista.body.horarios[0]).toEqual({ dia_semana: 0, inicio: '08:00', fim: '18:00' });
  });

  test('inativar profissional impede novos agendamentos', async () => {
    const u = await criarUsuario('dent3', 'clinica', 'clinica');
    const p = await admc.post('/profissionais').send({ usuario_id: u, cro: 'CRO-SP 44444' });
    await admc.put(`/profissionais/${p.body.id}/horarios`).send({
      horarios: [
        {
          dia_semana: new Date(`${DATA}T12:00:00-03:00`).getUTCDay(),
          inicio: '08:00',
          fim: '18:00',
        },
      ],
    });
    await admc.patch(`/profissionais/${p.body.id}`).send({ ativo: false });
    const r = await sec
      .post('/consultas')
      .send({ paciente_id: pac1, profissional_id: p.body.id, inicio: t(9), fim: t(9, 30) });
    expect(r.status).toBe(400);
  });
});

describe('consultas — conflitos (RN-002) e liberação de horário (RN-010)', () => {
  const nova = (extra = {}) => ({
    paciente_id: pac1,
    profissional_id: prof1,
    cadeira: 1,
    inicio: t(9),
    fim: t(9, 30),
    ...extra,
  });

  test('cria; só Secretaria agenda; dentista lê', async () => {
    expect((await clin.post('/consultas').send(nova())).status).toBe(403);
    const ok = await sec.post('/consultas').send(nova());
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ status: 'agendada', cadeira: 1 });
    expect(ok.body.paciente.nome).toBe('Ana Agenda');
    expect(JSON.stringify(ok.body)).not.toMatch(/cpf|celular/);
    const lista = await clin.get(
      `/consultas?inicio=${encodeURIComponent(t(0))}&fim=${encodeURIComponent(t(23, 59))}&profissional=${prof1}`,
    );
    expect(lista.status).toBe(200);
    expect(lista.body.map((c) => c.id)).toContain(ok.body.id);
  });

  test('RN-002: mesmo profissional sobreposto 409; mesma cadeira com outro profissional 409; horários vizinhos passam', async () => {
    const mesmoProf = await sec
      .post('/consultas')
      .send(nova({ paciente_id: pac2, inicio: t(9, 15), fim: t(9, 45), cadeira: 2 }));
    expect(mesmoProf.status).toBe(409);
    expect(mesmoProf.body.erro).toMatch(/profissional/);
    const mesmaCadeira = await sec
      .post('/consultas')
      .send(nova({ paciente_id: pac2, profissional_id: prof2, inicio: t(9, 15), fim: t(9, 45) }));
    expect(mesmaCadeira.status).toBe(409);
    expect(mesmaCadeira.body.erro).toMatch(/cadeira/);
    expect(
      (await sec.post('/consultas').send(nova({ paciente_id: pac2, inicio: t(9, 30), fim: t(10) })))
        .status,
    ).toBe(201);
    expect(
      (
        await sec.post('/consultas').send(
          nova({
            paciente_id: pac2,
            profissional_id: prof2,
            cadeira: 2,
            inicio: t(9),
            fim: t(9, 30),
          }),
        )
      ).status,
    ).toBe(201);
  });

  test('RN-010: cancelada e faltou liberam o horário', async () => {
    const a = await sec.post('/consultas').send(nova({ inicio: t(11), fim: t(11, 30) }));
    expect(a.status).toBe(201);
    expect(
      (
        await sec
          .post('/consultas')
          .send(nova({ paciente_id: pac2, inicio: t(11), fim: t(11, 30) }))
      ).status,
    ).toBe(409);
    const cancel = await sec
      .post(`/consultas/${a.body.id}/cancelar`)
      .send({ motivo: 'Paciente pediu' });
    expect(cancel.status).toBe(200);
    expect(cancel.body).toMatchObject({
      status: 'cancelada',
      motivo_cancelamento: 'Paciente pediu',
    });
    const b = await sec
      .post('/consultas')
      .send(nova({ paciente_id: pac2, inicio: t(11), fim: t(11, 30) }));
    expect(b.status).toBe(201);
    expect(
      (await sec.patch(`/consultas/${b.body.id}/status`).send({ status: 'faltou' })).status,
    ).toBe(200);
    expect(
      (await sec.post('/consultas').send(nova({ inicio: t(11), fim: t(11, 30) }))).status,
    ).toBe(201);
  });

  test('janela: fora da jornada 409; atravessar o dia, duração absurda e paciente inexistente 400', async () => {
    expect(
      (await sec.post('/consultas').send(nova({ inicio: t(19), fim: t(19, 30) }))).status,
    ).toBe(409);
    expect(
      (await sec.post('/consultas').send(nova({ inicio: t(17, 45), fim: t(18, 15) }))).status,
    ).toBe(409);
    expect((await sec.post('/consultas').send(nova({ inicio: t(9), fim: t(9, 2) }))).status).toBe(
      400,
    );
    expect(
      (await sec.post('/consultas').send(nova({ inicio: t(8), fim: `${DATA}T23:59:00-03:00` })))
        .status,
    ).toBe(400);
    expect(
      (
        await sec.post('/consultas').send(
          nova({
            paciente_id: '00000000-0000-4000-8000-000000000000',
            inicio: t(15),
            fim: t(15, 30),
          }),
        )
      ).status,
    ).toBe(400);
    expect((await sec.post('/consultas').send(nova({ inicio: 'amanhã' }))).status).toBe(400);
  });

  test('listagem exige período válido', async () => {
    expect((await sec.get('/consultas')).status).toBe(400);
    expect(
      (
        await sec.get(
          `/consultas?inicio=${encodeURIComponent(t(0))}&fim=${encodeURIComponent('2099-01-01T00:00:00-03:00')}`,
        )
      ).status,
    ).toBe(400);
  });
});

describe('consultas — status, histórico e reagendamento', () => {
  let c;
  beforeAll(async () => {
    c = (
      await sec.post('/consultas').send({
        paciente_id: pac1,
        profissional_id: prof2,
        cadeira: 3,
        inicio: t(14),
        fim: t(14, 30),
      })
    ).body;
  });

  test('transições válidas gravam histórico com usuário; inválidas 409; cancelamento só por /cancelar', async () => {
    expect(
      (await sec.patch(`/consultas/${c.id}/status`).send({ status: 'em_atendimento' })).status,
    ).toBe(409);
    expect(
      (await sec.patch(`/consultas/${c.id}/status`).send({ status: 'cancelada' })).status,
    ).toBe(400);
    expect(
      (await sec.patch(`/consultas/${c.id}/status`).send({ status: 'confirmada' })).status,
    ).toBe(200);
    expect((await sec.patch(`/consultas/${c.id}/status`).send({ status: 'chegou' })).status).toBe(
      200,
    );
    expect(
      (await sec.patch(`/consultas/${c.id}/status`).send({ status: 'em_atendimento' })).status,
    ).toBe(200);
    expect(
      (await sec.patch(`/consultas/${c.id}/status`).send({ status: 'concluida' })).status,
    ).toBe(200);
    expect((await sec.patch(`/consultas/${c.id}/status`).send({ status: 'faltou' })).status).toBe(
      409,
    );

    const det = await sec.get(`/consultas/${c.id}`);
    expect(det.body.status).toBe('concluida');
    expect(det.body.historico.map((h) => h.para_status)).toEqual([
      'agendada',
      'confirmada',
      'chegou',
      'em_atendimento',
      'concluida',
    ]);
    expect(det.body.historico.every((h) => h.usuario_nome === 'sec')).toBe(true);
  });

  test('cancelar exige motivo, não vale para concluída nem duas vezes; concluída não reagenda', async () => {
    expect(
      (await sec.post(`/consultas/${c.id}/cancelar`).send({ motivo: 'Teste de motivo' })).status,
    ).toBe(409);
    const nova = (
      await sec.post('/consultas').send({
        paciente_id: pac2,
        profissional_id: prof2,
        cadeira: 3,
        inicio: t(15),
        fim: t(15, 30),
      })
    ).body;
    expect((await sec.post(`/consultas/${nova.id}/cancelar`).send({})).status).toBe(400);
    expect(
      (await sec.post(`/consultas/${nova.id}/cancelar`).send({ motivo: 'Imprevisto' })).status,
    ).toBe(200);
    expect(
      (await sec.post(`/consultas/${nova.id}/cancelar`).send({ motivo: 'Imprevisto' })).status,
    ).toBe(409);
    expect(
      (await sec.patch(`/consultas/${c.id}`).send({ inicio: t(16), fim: t(16, 30) })).status,
    ).toBe(409);
  });

  test('reagenda; conflito 409; o horário antigo fica livre', async () => {
    const r = (
      await sec.post('/consultas').send({
        paciente_id: pac1,
        profissional_id: prof2,
        cadeira: 4,
        inicio: t(10),
        fim: t(10, 30),
      })
    ).body;
    const outra = (
      await sec.post('/consultas').send({
        paciente_id: pac2,
        profissional_id: prof2,
        cadeira: 4,
        inicio: t(12),
        fim: t(12, 30),
      })
    ).body;
    expect(
      (await sec.patch(`/consultas/${r.id}`).send({ inicio: t(12), fim: t(12, 30) })).status,
    ).toBe(409);
    const ok = await sec.patch(`/consultas/${r.id}`).send({ inicio: t(13), fim: t(13, 30) });
    expect(ok.status).toBe(200);
    expect(new Date(ok.body.inicio).toISOString()).toBe(new Date(t(13)).toISOString());
    expect(
      (
        await sec.post('/consultas').send({
          paciente_id: pac2,
          profissional_id: prof2,
          cadeira: 4,
          inicio: t(10),
          fim: t(10, 30),
        })
      ).status,
    ).toBe(201);
    const det = await sec.get(`/consultas/${r.id}`);
    expect(det.body.historico.at(-1).observacao).toBe('Consulta reagendada');
    expect(outra.id).toBeTruthy();
  });
});

describe('bloqueios da agenda', () => {
  test('permissões: Secretaria e Adm. Clínica; dentista e laboratório não', async () => {
    const q = `inicio=${encodeURIComponent(t(0))}&fim=${encodeURIComponent(t(23, 59))}`;
    expect((await clin.get(`/bloqueios-agenda?${q}`)).status).toBe(403);
    expect((await lab.get(`/bloqueios-agenda?${q}`)).status).toBe(403);
    expect((await sec.get(`/bloqueios-agenda?${q}`)).status).toBe(200);
    expect((await admc.get(`/bloqueios-agenda?${q}`)).status).toBe(200);
  });

  test('bloqueio de profissional barra consulta; clínica toda barra todos; remover libera', async () => {
    const b = await admc
      .post('/bloqueios-agenda')
      .send({ profissional_id: prof1, inicio: t(16, 30), fim: t(17, 30), motivo: 'Curso' });
    expect(b.status).toBe(201);
    const barrada = await sec.post('/consultas').send({
      paciente_id: pac2,
      profissional_id: prof1,
      cadeira: 6,
      inicio: t(16, 15),
      fim: t(16, 45),
    });
    expect(barrada.status).toBe(409);
    expect(barrada.body.erro).toMatch(/Curso/);
    expect(
      (
        await sec.post('/consultas').send({
          paciente_id: pac2,
          profissional_id: prof2,
          cadeira: 6,
          inicio: t(16, 15),
          fim: t(16, 45),
        })
      ).status,
    ).toBe(201);

    expect((await admc.delete(`/bloqueios-agenda/${b.body.id}`)).status).toBe(204);
    expect((await admc.delete(`/bloqueios-agenda/${b.body.id}`)).status).toBe(404);

    const feriado = await sec
      .post('/bloqueios-agenda')
      .send({ inicio: t(17, 30), fim: t(18), motivo: 'Feriado' });
    expect(feriado.status).toBe(201);
    expect(feriado.body.profissional_id).toBeNull();
    expect(
      (
        await sec.post('/consultas').send({
          paciente_id: pac2,
          profissional_id: prof1,
          cadeira: 7,
          inicio: t(17, 30),
          fim: t(18),
        })
      ).status,
    ).toBe(409);
    await admc.delete(`/bloqueios-agenda/${feriado.body.id}`);
  });

  test('não bloqueia período que já tem consulta; dados inválidos 400', async () => {
    const c = await sec.post('/consultas').send({
      paciente_id: pac1,
      profissional_id: prof1,
      cadeira: 8,
      inicio: t(15),
      fim: t(15, 30),
    });
    expect(c.status).toBe(201);
    const r = await admc
      .post('/bloqueios-agenda')
      .send({ profissional_id: prof1, inicio: t(14, 45), fim: t(15, 15), motivo: 'Reunião' });
    expect(r.status).toBe(409);
    expect(
      (await admc.post('/bloqueios-agenda').send({ inicio: t(10), fim: t(9), motivo: 'Invertido' }))
        .status,
    ).toBe(400);
    expect((await admc.post('/bloqueios-agenda').send({ inicio: t(10), fim: t(11) })).status).toBe(
      400,
    );
  });
});

describe('disponibilidade e lembrete', () => {
  test('horários livres = jornada − consultas ativas − bloqueios', async () => {
    const u = await criarUsuario('dent4', 'clinica', 'clinica');
    const p = (await admc.post('/profissionais').send({ usuario_id: u, cro: 'CRO-SP 55555' })).body
      .id;
    await admc.put(`/profissionais/${p}/horarios`).send({
      horarios: [0, 1, 2, 3, 4, 5, 6].map((d) => ({
        dia_semana: d,
        inicio: '08:00',
        fim: '10:00',
      })),
    });
    await sec
      .post('/consultas')
      .send({ paciente_id: pac1, profissional_id: p, cadeira: 9, inicio: t(8, 30), fim: t(9) });
    const b = await admc
      .post('/bloqueios-agenda')
      .send({ profissional_id: p, inicio: t(9, 30), fim: t(10), motivo: 'Intervalo' });

    const res = await sec.get(`/agenda/disponibilidade?profissional=${p}&data=${DATA}&duracao=30`);
    expect(res.status).toBe(200);
    expect(res.body.livres.map((s) => s.inicio)).toEqual([
      new Date(t(8)).toISOString(),
      new Date(t(9)).toISOString(),
    ]);

    await admc.delete(`/bloqueios-agenda/${b.body.id}`);
    expect(
      (await sec.get(`/agenda/disponibilidade?profissional=${p}&data=${DATA}&duracao=60`)).body
        .livres,
    ).toHaveLength(1);
    expect(
      (await sec.get(`/agenda/disponibilidade?profissional=${p}&data=31-12-2027`)).status,
    ).toBe(400);
    expect((await lab.get(`/agenda/disponibilidade?profissional=${p}&data=${DATA}`)).status).toBe(
      403,
    );
  });

  test('lembrete WhatsApp: link wa.me com mensagem e celular mascarado; auditado; sem celular 400', async () => {
    const c = (
      await sec.post('/consultas').send({
        paciente_id: pac1,
        profissional_id: prof1,
        cadeira: 10,
        inicio: t(13),
        fim: t(13, 30),
      })
    ).body;
    expect((await clin.get(`/consultas/${c.id}/lembrete-whatsapp`)).status).toBe(403);
    const res = await sec.get(`/consultas/${c.id}/lembrete-whatsapp`);
    expect(res.status).toBe(200);
    expect(res.body.url).toMatch(/^https:\/\/wa\.me\/5511987654321\?text=/);
    const msg = decodeURIComponent(res.body.url.split('text=')[1]);
    expect(msg).toContain('Olá, Ana!');
    expect(msg).toContain('13:00');
    expect(msg).toContain('dent1');
    expect(res.body.celular).toBe('(11) *****-4321');

    const semCel = (
      await sec.post('/consultas').send({
        paciente_id: pac2,
        profissional_id: prof1,
        cadeira: 10,
        inicio: t(14),
        fim: t(14, 30),
      })
    ).body;
    expect((await sec.get(`/consultas/${semCel.id}/lembrete-whatsapp`)).status).toBe(400);
    await sec.post(`/consultas/${c.id}/cancelar`).send({ motivo: 'Teste' });
    expect((await sec.get(`/consultas/${c.id}/lembrete-whatsapp`)).status).toBe(409);
    await esperar();
    const aud = await admc.get(`/auditoria?entidade=consultas&entidade_id=${c.id}`);
    expect(aud.body.itens.map((i) => i.acao)).toEqual(
      expect.arrayContaining(['criar', 'lembrete_whatsapp', 'cancelar']),
    );
  });

  test('resumo do paciente lista próximas consultas e OS (vazio até o M3)', async () => {
    const r = await sec.get(`/pacientes/${pac1}/resumo`);
    expect(r.status).toBe(200);
    expect(r.body.proximas_consultas.length).toBeGreaterThan(0);
    expect(r.body.os_em_aberto).toEqual([]);
    expect(r.body.paciente.cpf).toMatch(/^\*\*\*/);
  });
});

describe('CSRF nas rotas novas', () => {
  test('escrita sem token é barrada', async () => {
    const res = await request(app)
      .post(`${V1}/pacientes`)
      .send({ nome: 'Sem Csrf', cpf: novoCpf() });
    expect(res.status).toBe(401);
  });
});
