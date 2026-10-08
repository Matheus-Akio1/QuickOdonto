const bcrypt = require('bcryptjs');
const { cifrar, hashBusca } = require('../src/lib/crypto');

/** Seed de DESENVOLVIMENTO da clínica: 2 profissionais com jornada e 8 pacientes. */
const SENHA_DEV = process.env.SEED_SENHA || 'Dev@12345';

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

const PACIENTES = [
  ['Mariana Souza Lima', '1988-03-12', 'F', '11987651234', 'Indicação'],
  ['Carlos Eduardo Pereira', '1975-11-02', 'M', '11976543210', 'Instagram'],
  ['Fernanda Alves Rocha', '1992-07-25', 'F', '21998761234', 'Google'],
  ['João Pedro Martins', '2001-01-30', 'M', '11965432109', 'Indicação'],
  ['Luciana Barbosa', '1969-09-14', 'F', '31987654321', 'Convênio vizinho'],
  ['Rafael Nogueira', '1983-05-05', 'M', '11954321098', 'Instagram'],
  ['Patrícia Gomes', '1995-12-19', 'F', '41999887766', 'Google'],
  ['Thiago Ribeiro', '1979-04-08', 'M', '11943210987', 'Indicação'],
];

exports.seed = async (knex) => {
  const senha_hash = await bcrypt.hash(SENHA_DEV, 10);
  await knex('usuarios')
    .insert({
      nome: 'Dentista Dev 2',
      email: 'clinica2@quickodonto.test',
      senha_hash,
      perfil: 'clinica',
      unidade: 'clinica',
    })
    .onConflict('email')
    .ignore();

  const dentistas = await knex('usuarios').whereIn('email', [
    'clinica@quickodonto.test',
    'clinica2@quickodonto.test',
  ]);
  const cores = ['#2f7d6d', '#b5522e'];
  for (const [i, u] of dentistas.entries()) {
    await knex('profissionais')
      .insert({
        usuario_id: u.id,
        cro: `CRO-SP 9000${i + 1}`,
        especialidade: 'Clínico geral',
        cor_agenda: cores[i],
      })
      .onConflict('usuario_id')
      .ignore();
  }
  for (const p of await knex('profissionais').select('id')) {
    const tem = await knex('profissional_horarios').where({ profissional_id: p.id }).first();
    if (tem) continue;
    const janelas = [];
    for (let dia = 1; dia <= 5; dia += 1) {
      janelas.push({ profissional_id: p.id, dia_semana: dia, inicio: '08:00', fim: '12:00' });
      janelas.push({ profissional_id: p.id, dia_semana: dia, inicio: '14:00', fim: '18:00' });
    }
    await knex('profissional_horarios').insert(janelas);
  }

  for (const [i, [nome, nascimento, sexo, celular, origem]] of PACIENTES.entries()) {
    const cpf = gerarCpf(123456000 + i * 7);
    await knex('pacientes')
      .insert({
        nome,
        cpf_cifrado: cifrar(cpf),
        cpf_hash: hashBusca(cpf),
        nascimento,
        sexo,
        celular,
        origem,
      })
      .onConflict('cpf_hash')
      .ignore();
  }
};
