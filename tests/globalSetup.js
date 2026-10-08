const knex = require('knex');
const knexfile = require('../knexfile');

const BANCO_TESTE = 'quickodonto_test';

module.exports = async () => {
  const admin = knex({ ...knexfile, connection: { ...knexfile.connection, database: 'postgres' } });
  const { rows } = await admin.raw('SELECT 1 FROM pg_database WHERE datname = ?', [BANCO_TESTE]);
  if (!rows.length) await admin.raw(`CREATE DATABASE ${BANCO_TESTE}`);
  await admin.destroy();

  const db = knex({ ...knexfile, connection: { ...knexfile.connection, database: BANCO_TESTE } });
  await db.migrate.latest();
  await db.raw(
    'TRUNCATE usuarios, perfis_permissoes, auditoria_logs, notificacoes, pacientes, bloqueios_agenda, procedimentos_catalogo, links_download RESTART IDENTITY CASCADE',
  );
  await db.destroy();
};
