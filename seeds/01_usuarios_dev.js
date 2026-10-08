const bcrypt = require('bcryptjs');

/**
 * Seed de DESENVOLVIMENTO. Senha de teste local, nunca usar em produção.
 * Pode ser trocada via SEED_SENHA.
 */
const SENHA_DEV = process.env.SEED_SENHA || 'Dev@12345';

const USUARIOS = [
  ['Secretaria Dev', 'secretaria@quickodonto.test', 'secretaria', 'clinica'],
  ['Dentista Dev', 'clinica@quickodonto.test', 'clinica', 'clinica'],
  ['Adm Clínica Dev', 'adm.clinica@quickodonto.test', 'adm_clinica', 'clinica'],
  ['Técnico Lab Dev', 'laboratorio@quickodonto.test', 'laboratorio', 'laboratorio'],
  ['Adm Laboratório Dev', 'adm.laboratorio@quickodonto.test', 'adm_laboratorio', 'laboratorio'],
];

const PERMISSOES_LABORATORIO = ['entrada_estoque', 'criar_os_externa', 'cancelar_os'];

exports.seed = async (knex) => {
  const senha_hash = await bcrypt.hash(SENHA_DEV, 10);

  for (const [nome, email, perfil, unidade] of USUARIOS) {
    await knex('usuarios')
      .insert({ nome, email, senha_hash, perfil, unidade })
      .onConflict('email')
      .ignore();
  }

  for (const chave of PERMISSOES_LABORATORIO) {
    await knex('perfis_permissoes')
      .insert({ perfil: 'laboratorio', chave, habilitado: false })
      .onConflict(['perfil', 'chave'])
      .ignore();
  }
};
