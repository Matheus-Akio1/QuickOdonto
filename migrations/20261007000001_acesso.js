/**
 * M1 — Acesso: usuarios, perfis_permissoes, sessoes (refresh token rotativo).
 *
 * Classificação (seção 3.1 do checklist):
 *  - senha_hash: bcrypt (nunca reversível)
 *  - email: em claro (base de busca/login), unicidade por índice único
 *  - refresh token: só o hash SHA-256 é guardado; o valor em claro vive no cookie httpOnly
 */
exports.up = async (knex) => {
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

  await knex.schema.createTable('usuarios', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.text('nome').notNullable();
    t.text('email').notNullable().unique();
    t.text('senha_hash').notNullable();
    t.text('perfil').notNullable();
    t.text('unidade').notNullable();
    t.text('status').notNullable().defaultTo('ativo');
    t.timestamp('ultimo_acesso', { useTz: true });
    t.boolean('dois_fatores').notNullable().defaultTo(false);
    t.integer('tentativas_falhas').notNullable().defaultTo(0);
    t.timestamp('bloqueado_ate', { useTz: true });
    t.timestamp('criado_em', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('atualizado_em', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
  await knex.raw(`ALTER TABLE usuarios
    ADD CONSTRAINT usuarios_perfil_chk CHECK (perfil IN ('secretaria','clinica','adm_clinica','laboratorio','adm_laboratorio')),
    ADD CONSTRAINT usuarios_unidade_chk CHECK (unidade IN ('clinica','laboratorio')),
    ADD CONSTRAINT usuarios_status_chk CHECK (status IN ('ativo','bloqueado','convidado'))`);

  await knex.schema.createTable('perfis_permissoes', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.text('perfil').notNullable();
    t.text('chave').notNullable();
    t.boolean('habilitado').notNullable().defaultTo(false);
    t.timestamp('criado_em', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('atualizado_em', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.unique(['perfil', 'chave']);
  });

  await knex.schema.createTable('sessoes', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('usuario_id').notNullable().references('id').inTable('usuarios').onDelete('CASCADE');
    t.text('refresh_hash').notNullable().unique();
    t.text('user_agent');
    t.text('ip');
    t.timestamp('ultimo_uso', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('expira_em', { useTz: true }).notNullable();
    t.timestamp('revogada_em', { useTz: true });
    t.timestamp('criado_em', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('atualizado_em', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.index(['usuario_id']);
  });
};

exports.down = async (knex) => {
  await knex.schema.dropTableIfExists('sessoes');
  await knex.schema.dropTableIfExists('perfis_permissoes');
  await knex.schema.dropTableIfExists('usuarios');
};
