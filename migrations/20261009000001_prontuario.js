/**
 * M4 — Prontuário clínico.
 *
 * Classificação (seção 3.1):
 *  - texto clínico livre (respostas e alertas da anamnese, evoluções, adendos, observações de
 *    procedimento e de plano) → CIFRADO por campo (AES-256-GCM, colunas *_cifrado), sem busca;
 *  - anexos → arquivo CIFRADO no disco (fora do diretório público); no banco só metadados;
 *  - catálogo, dente, faces, status, valores e datas → em claro (filtros e relatórios).
 *
 * RN-006 (sem exclusão de registro clínico; correção por adendo) é garantida por trigger:
 * a aplicação não consegue apagar nem reescrever o que foi registrado.
 * As FKs para pacientes são RESTRICT: paciente com prontuário nunca é excluído (RN-009).
 */
const ts = (t, knex) => {
  t.timestamp('criado_em', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  t.timestamp('atualizado_em', { useTz: true }).notNullable().defaultTo(knex.fn.now());
};

exports.up = async (knex) => {
  // Função genérica: bloqueia UPDATE/DELETE. Permite apenas zerar usuario_id/profissional_id
  // quando o usuário for removido (ON DELETE SET NULL), mantendo o resto intacto.
  await knex.raw(`
    CREATE FUNCTION registro_clinico_imutavel() RETURNS trigger AS $$
    BEGIN
      IF TG_OP = 'UPDATE'
         AND (to_jsonb(NEW) - 'usuario_id' - 'atualizado_em') = (to_jsonb(OLD) - 'usuario_id' - 'atualizado_em')
      THEN
        RETURN NEW;
      END IF;
      RAISE EXCEPTION 'registro clínico não pode ser alterado nem excluído (RN-006): %', TG_TABLE_NAME;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await knex.schema.createTable('acessos_prontuario', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('paciente_id').notNullable().references('id').inTable('pacientes');
    t.uuid('usuario_id').references('id').inTable('usuarios').onDelete('SET NULL');
    t.text('recurso').notNullable();
    t.text('ip');
    t.timestamp('em', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    ts(t, knex);
    t.index(['paciente_id', 'em']);
  });

  await knex.schema.createTable('anamneses', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('paciente_id').notNullable().references('id').inTable('pacientes');
    t.integer('versao').notNullable();
    t.text('respostas_cifrado').notNullable();
    t.text('alertas_cifrado').notNullable();
    t.uuid('profissional_id').notNullable().references('id').inTable('profissionais');
    t.timestamp('assinada_em', { useTz: true });
    ts(t, knex);
    t.unique(['paciente_id', 'versao']);
  });

  await knex.schema.createTable('evolucoes', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('paciente_id').notNullable().references('id').inTable('pacientes');
    t.uuid('consulta_id').references('id').inTable('consultas');
    t.text('conteudo_cifrado').notNullable();
    t.uuid('profissional_id').notNullable().references('id').inTable('profissionais');
    ts(t, knex);
    t.index(['paciente_id', 'criado_em']);
  });

  await knex.schema.createTable('adendos', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('evolucao_id').notNullable().references('id').inTable('evolucoes');
    t.text('conteudo_cifrado').notNullable();
    t.uuid('profissional_id').notNullable().references('id').inTable('profissionais');
    ts(t, knex);
    t.index(['evolucao_id']);
  });

  await knex.schema.createTable('anexos', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('paciente_id').references('id').inTable('pacientes');
    t.uuid('os_id'); // FK entra no M3 (ordens de serviço)
    t.text('tipo').notNullable();
    t.text('nome').notNullable();
    t.text('mime').notNullable();
    t.integer('tamanho').notNullable();
    t.text('caminho').notNullable().unique();
    t.uuid('usuario_id').references('id').inTable('usuarios').onDelete('SET NULL');
    ts(t, knex);
    t.index(['paciente_id', 'criado_em']);
  });
  await knex.raw(`ALTER TABLE anexos
    ADD CONSTRAINT anexos_tipo_chk CHECK (tipo IN ('radiografia','foto','documento','escaneamento','outro')),
    ADD CONSTRAINT anexos_dono_chk CHECK (paciente_id IS NOT NULL OR os_id IS NOT NULL)`);

  // Links de download de uso único e curta duração (anexos e PDF do prontuário).
  await knex.schema.createTable('links_download', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.text('token_hash').notNullable().unique();
    t.text('tipo').notNullable();
    t.uuid('referencia_id').notNullable();
    t.uuid('usuario_id').notNullable().references('id').inTable('usuarios');
    t.timestamp('expira_em', { useTz: true }).notNullable();
    t.timestamp('usado_em', { useTz: true });
    ts(t, knex);
  });
  await knex.raw(
    "ALTER TABLE links_download ADD CONSTRAINT links_tipo_chk CHECK (tipo IN ('anexo','prontuario_pdf'))",
  );

  await knex.schema.createTable('procedimentos_catalogo', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.text('codigo').notNullable().unique();
    t.text('nome').notNullable();
    t.text('especialidade');
    t.integer('duracao_min').notNullable().defaultTo(30);
    t.decimal('valor_padrao', 12, 2).notNullable().defaultTo(0);
    t.boolean('ativo').notNullable().defaultTo(true);
    ts(t, knex);
  });
  await knex.raw(
    'ALTER TABLE procedimentos_catalogo ADD CONSTRAINT catalogo_chk CHECK (duracao_min > 0 AND valor_padrao >= 0)',
  );

  await knex.schema.createTable('planos_tratamento', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('paciente_id').notNullable().references('id').inTable('pacientes');
    t.uuid('profissional_id').references('id').inTable('profissionais');
    t.text('status').notNullable().defaultTo('rascunho');
    t.text('observacao_cifrado');
    t.decimal('total', 12, 2).notNullable().defaultTo(0);
    t.uuid('criado_por').references('id').inTable('usuarios').onDelete('SET NULL');
    t.timestamp('aprovado_em', { useTz: true });
    t.uuid('aprovado_por').references('id').inTable('usuarios').onDelete('SET NULL');
    ts(t, knex);
    t.index(['paciente_id']);
  });
  await knex.raw(
    "ALTER TABLE planos_tratamento ADD CONSTRAINT planos_status_chk CHECK (status IN ('rascunho','aprovado'))",
  );

  await knex.schema.createTable('procedimentos_paciente', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('paciente_id').notNullable().references('id').inTable('pacientes');
    t.uuid('catalogo_id').notNullable().references('id').inTable('procedimentos_catalogo');
    t.smallint('dente');
    t.specificType('faces', 'text[]').notNullable().defaultTo('{}');
    t.text('status').notNullable().defaultTo('planejado');
    t.uuid('profissional_id').references('id').inTable('profissionais');
    t.date('data');
    t.decimal('valor', 12, 2).notNullable().defaultTo(0);
    t.text('observacao_cifrado');
    t.uuid('plano_id').references('id').inTable('planos_tratamento');
    ts(t, knex);
    t.index(['paciente_id', 'dente']);
  });
  await knex.raw(`ALTER TABLE procedimentos_paciente
    ADD CONSTRAINT proc_status_chk CHECK (status IN ('planejado','em_andamento','concluido','cancelado')),
    ADD CONSTRAINT proc_faces_chk CHECK (faces <@ ARRAY['V','L','M','D','O','I']::text[]),
    ADD CONSTRAINT proc_faces_dente_chk CHECK (cardinality(faces) = 0 OR dente IS NOT NULL),
    ADD CONSTRAINT proc_concluido_data_chk CHECK (status <> 'concluido' OR data IS NOT NULL),
    ADD CONSTRAINT proc_valor_chk CHECK (valor >= 0)`);

  await knex.schema.createTable('procedimento_adendos', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('procedimento_id').notNullable().references('id').inTable('procedimentos_paciente');
    t.text('conteudo_cifrado').notNullable();
    t.uuid('usuario_id').references('id').inTable('usuarios').onDelete('SET NULL');
    ts(t, knex);
  });

  await knex.schema.createTable('plano_itens', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('plano_id').notNullable().references('id').inTable('planos_tratamento');
    t.uuid('catalogo_id').notNullable().references('id').inTable('procedimentos_catalogo');
    t.smallint('dente');
    t.specificType('faces', 'text[]').notNullable().defaultTo('{}');
    t.decimal('valor', 12, 2).notNullable();
    t.uuid('procedimento_id').references('id').inTable('procedimentos_paciente');
    ts(t, knex);
  });

  // Imutabilidade total: trilha de acesso, evoluções, adendos, anexos.
  for (const tabela of [
    'acessos_prontuario',
    'evolucoes',
    'adendos',
    'procedimento_adendos',
    'anexos',
  ]) {
    await knex.raw(`CREATE TRIGGER ${tabela}_imutavel BEFORE UPDATE OR DELETE ON ${tabela}
      FOR EACH ROW EXECUTE FUNCTION registro_clinico_imutavel()`);
  }

  // Anamnese: nunca é apagada; a única mudança aceita é assinar (assinada_em de NULL para um valor).
  await knex.raw(`
    CREATE FUNCTION anamnese_imutavel() RETURNS trigger AS $$
    BEGIN
      IF TG_OP = 'UPDATE' AND OLD.assinada_em IS NULL AND NEW.assinada_em IS NOT NULL
         AND (to_jsonb(NEW) - 'assinada_em' - 'atualizado_em') = (to_jsonb(OLD) - 'assinada_em' - 'atualizado_em')
      THEN
        RETURN NEW;
      END IF;
      RAISE EXCEPTION 'anamnese não pode ser alterada nem excluída: crie uma nova versão (RF-CLI-003)';
    END;
    $$ LANGUAGE plpgsql;
    CREATE TRIGGER anamneses_imutavel BEFORE UPDATE OR DELETE ON anamneses
      FOR EACH ROW EXECUTE FUNCTION anamnese_imutavel();
  `);

  // Procedimento: sem DELETE; depois de concluído ou cancelado, nada muda (correção por adendo).
  await knex.raw(`
    CREATE FUNCTION procedimento_imutavel() RETURNS trigger AS $$
    BEGIN
      IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'procedimento não pode ser excluído (RN-006): cancele ou registre adendo';
      END IF;
      IF OLD.status IN ('concluido','cancelado') THEN
        RAISE EXCEPTION 'procedimento % só aceita adendo (RN-006)', OLD.status;
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
    CREATE TRIGGER procedimentos_paciente_imutavel BEFORE UPDATE OR DELETE ON procedimentos_paciente
      FOR EACH ROW EXECUTE FUNCTION procedimento_imutavel();
  `);

  // Plano: sem DELETE; itens não mudam depois de aprovado (exceto o vínculo com o procedimento gerado).
  await knex.raw(`
    CREATE FUNCTION plano_sem_exclusao() RETURNS trigger AS $$
    BEGIN
      RAISE EXCEPTION 'plano de tratamento não pode ser excluído';
    END;
    $$ LANGUAGE plpgsql;
    CREATE TRIGGER planos_sem_exclusao BEFORE DELETE ON planos_tratamento
      FOR EACH ROW EXECUTE FUNCTION plano_sem_exclusao();
    CREATE TRIGGER plano_itens_sem_exclusao BEFORE DELETE ON plano_itens
      FOR EACH ROW EXECUTE FUNCTION plano_sem_exclusao();
  `);

  await knex.raw(`
    COMMENT ON COLUMN anamneses.respostas_cifrado IS 'CIFRADO (AES-256-GCM, v1): JSON das respostas. Nunca filtrar/indexar.';
    COMMENT ON COLUMN anamneses.alertas_cifrado IS 'CIFRADO (AES-256-GCM, v1): JSON dos alertas clínicos.';
    COMMENT ON COLUMN evolucoes.conteudo_cifrado IS 'CIFRADO (AES-256-GCM, v1). Imutável (RN-006).';
    COMMENT ON COLUMN adendos.conteudo_cifrado IS 'CIFRADO (AES-256-GCM, v1). Imutável.';
    COMMENT ON COLUMN procedimentos_paciente.observacao_cifrado IS 'CIFRADO (AES-256-GCM, v1).';
    COMMENT ON COLUMN procedimento_adendos.conteudo_cifrado IS 'CIFRADO (AES-256-GCM, v1). Imutável.';
    COMMENT ON COLUMN planos_tratamento.observacao_cifrado IS 'CIFRADO (AES-256-GCM, v1).';
    COMMENT ON COLUMN anexos.caminho IS 'Nome do arquivo CIFRADO em STORAGE_DIR (fora do diretório público).';
    COMMENT ON COLUMN links_download.token_hash IS 'HASH SHA-256 do token de uso único.';
  `);
};

exports.down = async (knex) => {
  for (const t of [
    'plano_itens',
    'procedimento_adendos',
    'procedimentos_paciente',
    'planos_tratamento',
    'procedimentos_catalogo',
    'links_download',
    'anexos',
    'adendos',
    'evolucoes',
    'anamneses',
    'acessos_prontuario',
  ]) {
    await knex.schema.dropTableIfExists(t);
  }
  for (const f of [
    'plano_sem_exclusao',
    'procedimento_imutavel',
    'anamnese_imutavel',
    'registro_clinico_imutavel',
  ]) {
    await knex.raw(`DROP FUNCTION IF EXISTS ${f}()`);
  }
};
