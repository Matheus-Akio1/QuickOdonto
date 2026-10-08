/**
 * M2 — Pacientes e Agenda.
 *
 * Classificação dos campos (seção 3.1):
 *  - pacientes.cpf_cifrado: AES-256-GCM; pacientes.cpf_hash: HMAC p/ busca e unicidade
 *  - pacientes.observacoes_cifrado: texto livre, tratado como clínico → cifrado (não buscável)
 *  - nome, celular, e-mail, nascimento, endereço, nº do prontuário: em claro (base da busca)
 *  - profissionais.cro: em claro (registro público do conselho) — decisão registrada
 */
exports.up = async (knex) => {
  await knex.raw('CREATE EXTENSION IF NOT EXISTS btree_gist');
  await knex.raw('CREATE SEQUENCE pacientes_prontuario_seq START 1');

  await knex.schema.createTable('profissionais', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('usuario_id').notNullable().unique().references('id').inTable('usuarios');
    t.text('cro').notNullable();
    t.text('especialidade');
    t.text('cor_agenda').notNullable().defaultTo('#2f7d6d');
    t.boolean('ativo').notNullable().defaultTo(true);
    t.timestamp('criado_em', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('atualizado_em', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('profissional_horarios', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('profissional_id')
      .notNullable()
      .references('id')
      .inTable('profissionais')
      .onDelete('CASCADE');
    t.smallint('dia_semana').notNullable(); // 0 = domingo … 6 = sábado
    t.time('inicio').notNullable();
    t.time('fim').notNullable();
    t.timestamp('criado_em', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('atualizado_em', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.index(['profissional_id', 'dia_semana']);
  });
  await knex.raw(
    'ALTER TABLE profissional_horarios ADD CONSTRAINT horarios_chk CHECK (dia_semana BETWEEN 0 AND 6 AND fim > inicio)',
  );

  await knex.schema.createTable('pacientes', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.integer('numero_prontuario')
      .notNullable()
      .unique()
      .defaultTo(knex.raw("nextval('pacientes_prontuario_seq')"));
    t.text('nome').notNullable();
    t.text('cpf_cifrado');
    t.text('cpf_hash').unique();
    t.date('nascimento');
    t.text('sexo');
    t.text('celular');
    t.text('email');
    t.jsonb('endereco');
    t.text('responsavel_nome');
    t.text('responsavel_parentesco');
    t.text('responsavel_celular');
    t.text('origem');
    t.text('observacoes_cifrado');
    t.boolean('ativo').notNullable().defaultTo(true);
    t.timestamp('criado_em', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('atualizado_em', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.index(['nome']);
    t.index(['celular']);
  });
  await knex.raw(`ALTER TABLE pacientes
    ADD CONSTRAINT pacientes_sexo_chk CHECK (sexo IS NULL OR sexo IN ('F','M','O')),
    ADD CONSTRAINT pacientes_cpf_ou_resp_chk CHECK (cpf_hash IS NOT NULL OR responsavel_nome IS NOT NULL)`);

  await knex.schema.createTable('consentimentos_lgpd', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('paciente_id').notNullable().references('id').inTable('pacientes').onDelete('CASCADE');
    t.text('finalidade').notNullable();
    t.text('forma').notNullable();
    t.timestamp('data', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.uuid('registrado_por').references('id').inTable('usuarios').onDelete('SET NULL');
    t.timestamp('criado_em', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('atualizado_em', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
  await knex.raw(
    "ALTER TABLE consentimentos_lgpd ADD CONSTRAINT consent_forma_chk CHECK (forma IN ('presencial','digital','termo_assinado'))",
  );

  await knex.schema.createTable('consultas', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('paciente_id').notNullable().references('id').inTable('pacientes');
    t.uuid('profissional_id').notNullable().references('id').inTable('profissionais');
    t.integer('cadeira').notNullable().defaultTo(1);
    t.timestamp('inicio', { useTz: true }).notNullable();
    t.timestamp('fim', { useTz: true }).notNullable();
    t.text('procedimento_previsto');
    t.text('status').notNullable().defaultTo('agendada');
    t.text('motivo_cancelamento');
    t.timestamp('criado_em', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('atualizado_em', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.index(['profissional_id', 'inicio']);
    t.index(['paciente_id', 'inicio']);
  });
  await knex.raw(`ALTER TABLE consultas
    ADD CONSTRAINT consultas_status_chk CHECK (status IN
      ('agendada','confirmada','chegou','em_atendimento','concluida','faltou','cancelada')),
    ADD CONSTRAINT consultas_periodo_chk CHECK (fim > inicio),
    -- RN-002: sem sobreposição por profissional nem por cadeira.
    -- RN-010: faltou/cancelada saem da restrição e liberam o horário.
    ADD CONSTRAINT consultas_sem_conflito_profissional EXCLUDE USING gist
      (profissional_id WITH =, tstzrange(inicio, fim) WITH &&) WHERE (status NOT IN ('faltou','cancelada')),
    ADD CONSTRAINT consultas_sem_conflito_cadeira EXCLUDE USING gist
      (cadeira WITH =, tstzrange(inicio, fim) WITH &&) WHERE (status NOT IN ('faltou','cancelada'))`);

  await knex.schema.createTable('consulta_historico', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('consulta_id').notNullable().references('id').inTable('consultas').onDelete('CASCADE');
    t.text('de_status');
    t.text('para_status').notNullable();
    t.uuid('usuario_id').references('id').inTable('usuarios').onDelete('SET NULL');
    t.text('observacao');
    t.timestamp('em', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('criado_em', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('atualizado_em', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.index(['consulta_id']);
  });

  await knex.schema.createTable('bloqueios_agenda', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('profissional_id').references('id').inTable('profissionais').onDelete('CASCADE'); // nulo = clínica toda
    t.timestamp('inicio', { useTz: true }).notNullable();
    t.timestamp('fim', { useTz: true }).notNullable();
    t.text('motivo').notNullable();
    t.uuid('criado_por').references('id').inTable('usuarios').onDelete('SET NULL');
    t.timestamp('criado_em', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('atualizado_em', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.index(['inicio', 'fim']);
  });
  await knex.raw(
    'ALTER TABLE bloqueios_agenda ADD CONSTRAINT bloqueios_periodo_chk CHECK (fim > inicio)',
  );
};

exports.down = async (knex) => {
  for (const t of [
    'bloqueios_agenda',
    'consulta_historico',
    'consultas',
    'consentimentos_lgpd',
    'pacientes',
    'profissional_horarios',
    'profissionais',
  ]) {
    await knex.schema.dropTableIfExists(t);
  }
  await knex.raw('DROP SEQUENCE IF EXISTS pacientes_prontuario_seq');
};
