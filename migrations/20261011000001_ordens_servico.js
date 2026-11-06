/**
 * M3 — Ordens de serviço (clínica ↔ laboratório).
 *
 * Classificação dos campos (seção 3.1):
 *  - laboratorio_clientes.documento_cifrado (CNPJ/CPF): AES-256-GCM; documento_hash: HMAC p/ busca e unicidade
 *  - ordens_servico.observacoes_cifrado: instrução livre do dentista, pode trazer dado clínico → cifrado, sem busca
 *  - razão social, responsável, CRO, telefone, e-mail, endereço, condição de pagamento → em claro
 *  - nome do paciente da OS externa → em claro (nome), sem nenhum outro dado do paciente
 *  - número, tipo de trabalho, elementos, cor, material, etapas, datas e valor → em claro (filtro e relatório)
 *  - motivos (cancelamento, prova, refação) e observação do histórico → em claro: texto técnico sobre a peça,
 *    entra em relatório de refações — decisão registrada
 *
 * Regras garantidas no banco:
 *  - RN-003: a OS da clínica só sai do pré-laboratório com laboratório e previsão de entrega (CHECK)
 *  - RN-012: toda criação, mudança de etapa e cancelamento grava usuário e data/hora em os_historico
 *    (trigger; sem usuário identificado a mudança é recusada) e o histórico é imutável
 *  - número da OS único; um só cliente interno (a clínica própria)
 */
const ts = (t, knex) => {
  t.timestamp('criado_em', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  t.timestamp('atualizado_em', { useTz: true }).notNullable().defaultTo(knex.fn.now());
};

const ETAPAS = "'pre_laboratorio','envio','laboratorio','retorno','concluida'";
const PRODUCAO = "'recebida','modelo','estrutura','prova','acabamento','pronta','enviada'";

exports.up = async (knex) => {
  await knex.raw('CREATE SEQUENCE os_numero_propria_seq START 1');
  await knex.raw('CREATE SEQUENCE os_numero_externa_seq START 1');

  await knex.schema.createTable('laboratorio_clientes', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.text('tipo').notNullable();
    t.text('razao_social').notNullable();
    t.text('documento_tipo');
    t.text('documento_cifrado');
    t.text('documento_hash').unique();
    t.text('responsavel');
    t.text('cro');
    t.text('telefone');
    t.text('email');
    t.jsonb('endereco');
    t.text('condicao_pagamento');
    t.boolean('ativo').notNullable().defaultTo(true);
    ts(t, knex);
    t.index(['razao_social']);
  });
  await knex.raw(`ALTER TABLE laboratorio_clientes
    ADD CONSTRAINT lab_clientes_tipo_chk CHECK (tipo IN ('interno','externo')),
    ADD CONSTRAINT lab_clientes_doc_chk CHECK (
      (documento_hash IS NULL AND documento_cifrado IS NULL AND documento_tipo IS NULL)
      OR (documento_hash IS NOT NULL AND documento_cifrado IS NOT NULL AND documento_tipo IN ('cnpj','cpf')))`);
  // A clínica própria é o único cliente interno.
  await knex.raw(
    "CREATE UNIQUE INDEX lab_clientes_interno_unico ON laboratorio_clientes ((true)) WHERE tipo = 'interno'",
  );

  await knex.schema.createTable('tabela_precos', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.text('tipo_trabalho').notNullable();
    t.uuid('cliente_id').references('id').inTable('laboratorio_clientes'); // nulo = preço padrão
    t.decimal('valor', 12, 2).notNullable();
    t.date('vigencia_inicio').notNullable().defaultTo(knex.raw('CURRENT_DATE'));
    ts(t, knex);
  });
  await knex.raw(
    'ALTER TABLE tabela_precos ADD CONSTRAINT tabela_precos_valor_chk CHECK (valor >= 0)',
  );
  await knex.raw(`CREATE UNIQUE INDEX tabela_precos_unico ON tabela_precos
    (lower(tipo_trabalho), COALESCE(cliente_id, '00000000-0000-0000-0000-000000000000'::uuid), vigencia_inicio)`);

  await knex.schema.createTable('ordens_servico', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.text('numero').notNullable().unique();
    t.text('origem').notNullable();
    t.uuid('cliente_id').notNullable().references('id').inTable('laboratorio_clientes');
    t.uuid('paciente_id').references('id').inTable('pacientes');
    t.text('paciente_nome');
    t.uuid('profissional_id').references('id').inTable('profissionais');
    t.text('dentista_nome');
    t.text('tipo_trabalho').notNullable();
    t.specificType('elementos', 'smallint[]').notNullable().defaultTo('{}');
    t.text('cor');
    t.text('material');
    t.text('observacoes_cifrado');
    t.text('laboratorio');
    t.timestamp('enviado_em', { useTz: true });
    t.date('previsao_entrega');
    t.decimal('valor', 12, 2);
    t.text('etapa');
    t.text('etapa_producao');
    t.uuid('tecnico_id').references('id').inTable('usuarios').onDelete('SET NULL');
    t.text('status').notNullable().defaultTo('aberta');
    t.text('motivo_cancelamento');
    t.timestamp('concluida_em', { useTz: true });
    t.timestamp('cancelada_em', { useTz: true });
    t.uuid('criado_por').references('id').inTable('usuarios').onDelete('SET NULL');
    ts(t, knex);
    t.index(['etapa', 'previsao_entrega']);
    t.index(['etapa_producao', 'previsao_entrega']);
    t.index(['cliente_id', 'status']);
    t.index(['paciente_id']);
  });
  await knex.raw(`ALTER TABLE ordens_servico
    ADD CONSTRAINT os_origem_chk CHECK (origem IN ('propria','externa')),
    ADD CONSTRAINT os_status_chk CHECK (status IN ('aberta','concluida','cancelada')),
    ADD CONSTRAINT os_etapa_chk CHECK (etapa IS NULL OR etapa IN (${ETAPAS})),
    ADD CONSTRAINT os_producao_chk CHECK (etapa_producao IS NULL OR etapa_producao IN (${PRODUCAO})),
    ADD CONSTRAINT os_laboratorio_chk CHECK (laboratorio IS NULL OR laboratorio IN ('proprio')),
    ADD CONSTRAINT os_valor_chk CHECK (valor IS NULL OR valor >= 0),
    ADD CONSTRAINT os_paciente_chk CHECK (
      (origem = 'propria' AND paciente_id IS NOT NULL AND etapa IS NOT NULL)
      OR (origem = 'externa' AND paciente_id IS NULL AND paciente_nome IS NOT NULL
          AND etapa IS NULL AND etapa_producao IS NOT NULL AND previsao_entrega IS NOT NULL)),
    ADD CONSTRAINT os_rn003_envio_chk CHECK (
      origem <> 'propria' OR etapa = 'pre_laboratorio'
      OR (laboratorio IS NOT NULL AND previsao_entrega IS NOT NULL)),
    ADD CONSTRAINT os_cancelada_chk CHECK (
      status <> 'cancelada' OR (motivo_cancelamento IS NOT NULL AND cancelada_em IS NOT NULL)),
    ADD CONSTRAINT os_concluida_chk CHECK (status <> 'concluida' OR concluida_em IS NOT NULL)`);

  await knex.schema.createTable('os_historico', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('os_id').notNullable().references('id').inTable('ordens_servico');
    t.text('lado').notNullable(); // clinica | laboratorio | status
    t.text('de_etapa');
    t.text('para_etapa').notNullable();
    t.uuid('usuario_id').references('id').inTable('usuarios').onDelete('SET NULL');
    t.text('observacao');
    // clock_timestamp(): várias linhas da mesma transação mantêm a ordem (lição 8).
    t.timestamp('em', { useTz: true }).notNullable().defaultTo(knex.raw('clock_timestamp()'));
    ts(t, knex);
    t.index(['os_id', 'em']);
  });
  await knex.raw(
    "ALTER TABLE os_historico ADD CONSTRAINT os_historico_lado_chk CHECK (lado IN ('clinica','laboratorio','status'))",
  );
  await knex.raw(`CREATE TRIGGER os_historico_imutavel BEFORE UPDATE OR DELETE ON os_historico
    FOR EACH ROW EXECUTE FUNCTION registro_clinico_imutavel()`);

  // RN-012 — o histórico é escrito pelo banco. O serviço identifica o usuário na transação com
  // set_config('quickodonto.usuario_id', ...); sem isso, a mudança de etapa é recusada.
  await knex.raw(`
    CREATE FUNCTION os_registrar_historico() RETURNS trigger AS $$
    DECLARE
      uid uuid := nullif(current_setting('quickodonto.usuario_id', true), '')::uuid;
      obs text := nullif(current_setting('quickodonto.observacao', true), '');
    BEGIN
      IF TG_OP = 'INSERT' THEN
        IF uid IS NULL THEN RAISE EXCEPTION 'OS criada sem usuário identificado (RN-012)'; END IF;
        INSERT INTO os_historico (os_id, lado, de_etapa, para_etapa, usuario_id, observacao)
        VALUES (NEW.id, CASE WHEN NEW.origem = 'propria' THEN 'clinica' ELSE 'laboratorio' END,
                NULL, COALESCE(NEW.etapa, NEW.etapa_producao), uid, obs);
        RETURN NEW;
      END IF;
      IF NEW.etapa IS DISTINCT FROM OLD.etapa
         OR NEW.etapa_producao IS DISTINCT FROM OLD.etapa_producao
         OR NEW.status IS DISTINCT FROM OLD.status THEN
        IF uid IS NULL THEN RAISE EXCEPTION 'mudança de etapa sem usuário identificado (RN-012)'; END IF;
      END IF;
      IF NEW.etapa_producao IS DISTINCT FROM OLD.etapa_producao AND NEW.etapa_producao IS NOT NULL THEN
        INSERT INTO os_historico (os_id, lado, de_etapa, para_etapa, usuario_id, observacao)
        VALUES (NEW.id, 'laboratorio', OLD.etapa_producao, NEW.etapa_producao, uid, obs);
      END IF;
      IF NEW.etapa IS DISTINCT FROM OLD.etapa THEN
        INSERT INTO os_historico (os_id, lado, de_etapa, para_etapa, usuario_id, observacao)
        VALUES (NEW.id, 'clinica', OLD.etapa, NEW.etapa, uid, obs);
      END IF;
      IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'concluida' THEN
        INSERT INTO os_historico (os_id, lado, de_etapa, para_etapa, usuario_id, observacao)
        VALUES (NEW.id, 'status', OLD.status, NEW.status, uid, COALESCE(NEW.motivo_cancelamento, obs));
      ELSIF NEW.status = 'concluida' AND OLD.status <> 'concluida' AND NEW.origem = 'externa' THEN
        INSERT INTO os_historico (os_id, lado, de_etapa, para_etapa, usuario_id, observacao)
        VALUES (NEW.id, 'status', OLD.status, NEW.status, uid, obs);
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
    CREATE TRIGGER ordens_servico_historico AFTER INSERT OR UPDATE ON ordens_servico
      FOR EACH ROW EXECUTE FUNCTION os_registrar_historico();
  `);
  // OS nunca é apagada: cancela-se com motivo.
  await knex.raw(`
    CREATE FUNCTION os_sem_exclusao() RETURNS trigger AS $$
    BEGIN
      RAISE EXCEPTION 'ordem de serviço não pode ser excluída: cancele com motivo';
    END;
    $$ LANGUAGE plpgsql;
    CREATE TRIGGER ordens_servico_sem_exclusao BEFORE DELETE ON ordens_servico
      FOR EACH ROW EXECUTE FUNCTION os_sem_exclusao();
  `);

  await knex.schema.createTable('os_provas', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('os_id').notNullable().references('id').inTable('ordens_servico');
    t.integer('numero').notNullable();
    t.timestamp('enviada_em', { useTz: true })
      .notNullable()
      .defaultTo(knex.raw('clock_timestamp()'));
    t.timestamp('devolvida_em', { useTz: true });
    t.text('resultado');
    t.text('motivo');
    t.uuid('usuario_id').references('id').inTable('usuarios').onDelete('SET NULL');
    ts(t, knex);
    t.unique(['os_id', 'numero']);
  });
  await knex.raw(`ALTER TABLE os_provas ADD CONSTRAINT os_provas_resultado_chk CHECK (
    (devolvida_em IS NULL AND resultado IS NULL) OR (devolvida_em IS NOT NULL AND resultado IN ('aprovada','ajuste')))`);

  await knex.schema.createTable('os_refacoes', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('os_id').notNullable().references('id').inTable('ordens_servico');
    t.integer('numero').notNullable();
    t.text('motivo').notNullable();
    t.timestamp('data', { useTz: true }).notNullable().defaultTo(knex.raw('clock_timestamp()'));
    t.uuid('usuario_id').references('id').inTable('usuarios').onDelete('SET NULL');
    ts(t, knex);
    t.unique(['os_id', 'numero']);
  });
  await knex.raw(`CREATE TRIGGER os_refacoes_imutavel BEFORE UPDATE OR DELETE ON os_refacoes
    FOR EACH ROW EXECUTE FUNCTION registro_clinico_imutavel()`);

  // Anexos de OS: a coluna já existia desde o M4, agora ganha a FK.
  await knex.raw(
    'ALTER TABLE anexos ADD CONSTRAINT anexos_os_fk FOREIGN KEY (os_id) REFERENCES ordens_servico(id)',
  );
  await knex.raw('CREATE INDEX anexos_os_idx ON anexos (os_id, criado_em) WHERE os_id IS NOT NULL');

  for (const [coluna, texto] of [
    [
      'laboratorio_clientes.documento_cifrado',
      'CIFRADO (AES-256-GCM). CNPJ/CPF — nunca indexar nem exibir sem máscara.',
    ],
    [
      'laboratorio_clientes.documento_hash',
      'HASH DE BUSCA (HMAC-SHA256). Usado na unicidade e na busca exata.',
    ],
    [
      'ordens_servico.observacoes_cifrado',
      'CIFRADO (AES-256-GCM). Instrução livre, pode conter dado clínico — sem busca.',
    ],
  ]) {
    await knex.raw(`COMMENT ON COLUMN ${coluna} IS '${texto}'`);
  }
};

exports.down = async (knex) => {
  await knex.raw('DROP INDEX IF EXISTS anexos_os_idx');
  await knex.raw('ALTER TABLE anexos DROP CONSTRAINT IF EXISTS anexos_os_fk');
  await knex.schema.dropTableIfExists('os_refacoes');
  await knex.schema.dropTableIfExists('os_provas');
  await knex.schema.dropTableIfExists('os_historico');
  await knex.schema.dropTableIfExists('ordens_servico');
  await knex.raw('DROP FUNCTION IF EXISTS os_registrar_historico()');
  await knex.raw('DROP FUNCTION IF EXISTS os_sem_exclusao()');
  await knex.schema.dropTableIfExists('tabela_precos');
  await knex.schema.dropTableIfExists('laboratorio_clientes');
  await knex.raw('DROP SEQUENCE IF EXISTS os_numero_propria_seq');
  await knex.raw('DROP SEQUENCE IF EXISTS os_numero_externa_seq');
};
