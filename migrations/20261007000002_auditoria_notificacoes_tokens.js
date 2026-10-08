/**
 * M1 — auditoria_logs (somente inserção), notificacoes e tokens_senha.
 * tokens_senha guarda só o hash SHA-256 do token enviado por e-mail (uso único, validade curta).
 */
exports.up = async (knex) => {
  await knex.schema.createTable('auditoria_logs', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('usuario_id').references('id').inTable('usuarios').onDelete('SET NULL');
    t.text('unidade');
    t.text('entidade').notNullable();
    t.text('entidade_id');
    t.text('acao').notNullable();
    t.jsonb('antes');
    t.jsonb('depois');
    t.text('ip');
    t.timestamp('em', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('criado_em', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('atualizado_em', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.index(['entidade', 'entidade_id']);
    t.index(['unidade', 'em']);
  });
  // Trilha imutável: sem DELETE e sem UPDATE — exceto zerar usuario_id quando o usuário
  // é removido (ON DELETE SET NULL do FK), preservando todo o resto do registro.
  await knex.raw(`
    CREATE FUNCTION auditoria_somente_insercao() RETURNS trigger AS $$
    BEGIN
      IF TG_OP = 'UPDATE' AND NEW.usuario_id IS NULL
         AND (to_jsonb(NEW) - 'usuario_id') = (to_jsonb(OLD) - 'usuario_id') THEN
        RETURN NEW;
      END IF;
      RAISE EXCEPTION 'auditoria_logs é somente inserção';
    END;
    $$ LANGUAGE plpgsql;
    CREATE TRIGGER auditoria_imutavel BEFORE UPDATE OR DELETE ON auditoria_logs
      FOR EACH ROW EXECUTE FUNCTION auditoria_somente_insercao();
  `);

  await knex.schema.createTable('notificacoes', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('usuario_id').notNullable().references('id').inTable('usuarios').onDelete('CASCADE');
    t.text('tipo').notNullable();
    t.text('titulo').notNullable();
    t.text('link');
    t.timestamp('lida_em', { useTz: true });
    t.timestamp('criado_em', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('atualizado_em', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.index(['usuario_id', 'criado_em']);
  });

  await knex.schema.createTable('tokens_senha', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('usuario_id').notNullable().references('id').inTable('usuarios').onDelete('CASCADE');
    t.text('token_hash').notNullable().unique();
    t.text('tipo').notNullable();
    t.timestamp('expira_em', { useTz: true }).notNullable();
    t.timestamp('usado_em', { useTz: true });
    t.timestamp('criado_em', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('atualizado_em', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
  await knex.raw(
    `ALTER TABLE tokens_senha ADD CONSTRAINT tokens_senha_tipo_chk CHECK (tipo IN ('redefinicao','convite'))`,
  );
};

exports.down = async (knex) => {
  await knex.schema.dropTableIfExists('tokens_senha');
  await knex.schema.dropTableIfExists('notificacoes');
  await knex.raw('DROP TRIGGER IF EXISTS auditoria_imutavel ON auditoria_logs');
  await knex.schema.dropTableIfExists('auditoria_logs');
  await knex.raw('DROP FUNCTION IF EXISTS auditoria_somente_insercao()');
};
