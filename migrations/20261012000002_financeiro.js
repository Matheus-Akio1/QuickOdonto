/**
 * M6 — Financeiro (por unidade: clínica e laboratório).
 *
 * Classificação dos campos (seção 3.1): valores, datas, formas de pagamento e situação ficam em
 * claro (filtro, soma e relatório). A descrição é texto curto de identificação do título e pode
 * trazer o nome do paciente ou do cliente (dado "em claro" na tabela 3.1) — nunca dado clínico.
 *
 * Regras garantidas no banco:
 *  - RN-008: todo lançamento, categoria e caixa pertence a uma unidade
 *  - RN-011: com o caixa do dia fechado, nenhuma baixa daquele dia entra, muda ou sai (trigger);
 *    reabrir exige justificativa (CHECK)
 *  - a soma das baixas nunca passa do valor do título e a situação acompanha as baixas (trigger)
 *  - baixas são imutáveis (só se estorna lançando outra movimentação)
 */
const ts = (t, knex) => {
  t.timestamp('criado_em', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  t.timestamp('atualizado_em', { useTz: true }).notNullable().defaultTo(knex.fn.now());
};

const FORMAS = "'pix','dinheiro','credito','debito','boleto','transferencia'";

const CATEGORIAS = [
  ['clinica', 'receita', 'tratamento', 'Tratamento'],
  ['clinica', 'receita', 'outras_receitas', 'Outras receitas'],
  ['clinica', 'despesa', 'protese_laboratorio', 'Prótese (laboratório)'],
  ['clinica', 'despesa', 'estoque', 'Estoque'],
  ['clinica', 'despesa', 'despesa_fixa', 'Despesa fixa'],
  ['clinica', 'despesa', 'pessoal', 'Pessoal'],
  ['clinica', 'despesa', 'outras_despesas', 'Outras despesas'],
  ['laboratorio', 'receita', 'servicos_os', 'Serviços (OS)'],
  ['laboratorio', 'receita', 'outras_receitas', 'Outras receitas'],
  ['laboratorio', 'despesa', 'estoque', 'Insumos'],
  ['laboratorio', 'despesa', 'despesa_fixa', 'Despesa fixa'],
  ['laboratorio', 'despesa', 'manutencao', 'Manutenção'],
  ['laboratorio', 'despesa', 'pessoal', 'Pessoal'],
  ['laboratorio', 'despesa', 'outras_despesas', 'Outras despesas'],
];

exports.up = async (knex) => {
  await knex.schema.createTable('categorias_financeiras', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.text('unidade').notNullable();
    t.text('tipo').notNullable();
    t.text('chave'); // categorias do sistema (usadas nos lançamentos automáticos)
    t.text('nome').notNullable();
    t.boolean('ativo').notNullable().defaultTo(true);
    ts(t, knex);
    t.unique(['unidade', 'tipo', 'nome']);
  });
  await knex.raw(`ALTER TABLE categorias_financeiras
    ADD CONSTRAINT categorias_unidade_chk CHECK (unidade IN ('clinica','laboratorio')),
    ADD CONSTRAINT categorias_tipo_chk CHECK (tipo IN ('receita','despesa'))`);
  await knex.raw(
    'CREATE UNIQUE INDEX categorias_chave_unica ON categorias_financeiras (unidade, chave) WHERE chave IS NOT NULL',
  );
  await knex('categorias_financeiras').insert(
    CATEGORIAS.map(([unidade, tipo, chave, nome]) => ({ unidade, tipo, chave, nome })),
  );

  await knex.schema.createTable('lancamentos', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.text('unidade').notNullable();
    t.text('tipo').notNullable();
    t.uuid('categoria_id').notNullable().references('id').inTable('categorias_financeiras');
    t.text('descricao').notNullable();
    t.decimal('valor', 12, 2).notNullable();
    t.decimal('valor_pago', 12, 2).notNullable().defaultTo(0);
    t.date('vencimento').notNullable();
    t.date('pagamento'); // data da baixa que quitou
    t.text('forma'); // forma prevista (ou a da última baixa)
    t.uuid('paciente_id').references('id').inTable('pacientes');
    t.uuid('cliente_id').references('id').inTable('laboratorio_clientes');
    t.uuid('os_id').references('id').inTable('ordens_servico');
    t.uuid('plano_id').references('id').inTable('planos_tratamento');
    t.uuid('grupo_id'); // parcelas e recorrências do mesmo lançamento original
    t.integer('parcela');
    t.integer('parcelas');
    t.text('recorrencia');
    t.text('situacao').notNullable().defaultTo('aberto');
    t.text('motivo_cancelamento');
    t.uuid('criado_por').references('id').inTable('usuarios').onDelete('SET NULL');
    ts(t, knex);
    t.index(['unidade', 'vencimento']);
    t.index(['unidade', 'situacao']);
    t.index(['cliente_id']);
    t.index(['os_id']);
  });
  await knex.raw(`ALTER TABLE lancamentos
    ADD CONSTRAINT lanc_unidade_chk CHECK (unidade IN ('clinica','laboratorio')),
    ADD CONSTRAINT lanc_tipo_chk CHECK (tipo IN ('receita','despesa')),
    ADD CONSTRAINT lanc_valor_chk CHECK (valor > 0 AND valor_pago >= 0 AND valor_pago <= valor),
    ADD CONSTRAINT lanc_forma_chk CHECK (forma IS NULL OR forma IN (${FORMAS})),
    ADD CONSTRAINT lanc_situacao_chk CHECK (situacao IN ('aberto','parcial','pago','cancelado')),
    ADD CONSTRAINT lanc_recorrencia_chk CHECK (recorrencia IS NULL OR recorrencia IN ('mensal')),
    ADD CONSTRAINT lanc_parcela_chk CHECK (
      (parcela IS NULL AND parcelas IS NULL) OR (parcela BETWEEN 1 AND parcelas)),
    ADD CONSTRAINT lanc_cancelado_chk CHECK (
      situacao <> 'cancelado' OR (motivo_cancelamento IS NOT NULL AND valor_pago = 0)),
    ADD CONSTRAINT lanc_coerencia_chk CHECK (
      (situacao = 'pago' AND valor_pago = valor AND pagamento IS NOT NULL)
      OR (situacao = 'parcial' AND valor_pago > 0 AND valor_pago < valor)
      OR (situacao IN ('aberto','cancelado') AND valor_pago = 0))`);
  // Um título por OS em cada unidade: concluir a OS nunca duplica a cobrança.
  await knex.raw(
    'CREATE UNIQUE INDEX lanc_os_unico ON lancamentos (unidade, os_id) WHERE os_id IS NOT NULL',
  );
  await knex.raw(
    'CREATE UNIQUE INDEX lanc_plano_unico ON lancamentos (plano_id) WHERE plano_id IS NOT NULL AND parcela IS NULL',
  );

  await knex.schema.createTable('caixas_diarios', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.text('unidade').notNullable();
    t.date('data').notNullable();
    t.jsonb('totais').notNullable(); // fotografia do fechamento: por forma, entradas, saídas
    t.timestamp('fechado_em', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.uuid('fechado_por').references('id').inTable('usuarios').onDelete('SET NULL');
    t.timestamp('reaberto_em', { useTz: true });
    t.uuid('reaberto_por').references('id').inTable('usuarios').onDelete('SET NULL');
    t.text('justificativa');
    ts(t, knex);
    t.unique(['unidade', 'data']);
  });
  await knex.raw(`ALTER TABLE caixas_diarios
    ADD CONSTRAINT caixa_unidade_chk CHECK (unidade IN ('clinica','laboratorio')),
    ADD CONSTRAINT caixa_reabertura_chk CHECK (
      reaberto_em IS NULL OR (justificativa IS NOT NULL AND length(trim(justificativa)) >= 5))`);

  await knex.schema.createTable('lancamento_baixas', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('lancamento_id').notNullable().references('id').inTable('lancamentos');
    t.decimal('valor', 12, 2).notNullable();
    t.date('data').notNullable();
    t.text('forma').notNullable();
    t.uuid('usuario_id').references('id').inTable('usuarios').onDelete('SET NULL');
    t.timestamp('em', { useTz: true }).notNullable().defaultTo(knex.raw('clock_timestamp()'));
    ts(t, knex);
    t.index(['lancamento_id']);
    t.index(['data']);
  });
  await knex.raw(`ALTER TABLE lancamento_baixas
    ADD CONSTRAINT baixa_valor_chk CHECK (valor > 0),
    ADD CONSTRAINT baixa_forma_chk CHECK (forma IN (${FORMAS}))`);

  // RN-011 + coerência do título: tudo o que mexe em dinheiro recebido/pago passa por aqui.
  await knex.raw(`
    CREATE FUNCTION baixa_aplicar() RETURNS trigger AS $$
    DECLARE
      l lancamentos%ROWTYPE;
      novo_pago numeric(12,2);
    BEGIN
      SELECT * INTO l FROM lancamentos WHERE id = NEW.lancamento_id FOR UPDATE;
      IF l.situacao = 'cancelado' THEN
        RAISE EXCEPTION 'lançamento cancelado não recebe baixa';
      END IF;
      IF EXISTS (SELECT 1 FROM caixas_diarios c
                  WHERE c.unidade = l.unidade AND c.data = NEW.data AND c.reaberto_em IS NULL) THEN
        RAISE EXCEPTION 'caixa do dia fechado: reabra com justificativa antes de lançar (RN-011)';
      END IF;
      novo_pago := l.valor_pago + NEW.valor;
      IF novo_pago > l.valor THEN
        RAISE EXCEPTION 'baixa maior que o saldo do lançamento';
      END IF;
      UPDATE lancamentos
         SET valor_pago = novo_pago,
             situacao = CASE WHEN novo_pago = valor THEN 'pago' ELSE 'parcial' END,
             pagamento = CASE WHEN novo_pago = valor THEN NEW.data ELSE NULL END,
             forma = NEW.forma,
             atualizado_em = now()
       WHERE id = l.id;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
    CREATE TRIGGER lancamento_baixas_aplicar BEFORE INSERT ON lancamento_baixas
      FOR EACH ROW EXECUTE FUNCTION baixa_aplicar();
    CREATE TRIGGER lancamento_baixas_imutavel BEFORE UPDATE OR DELETE ON lancamento_baixas
      FOR EACH ROW EXECUTE FUNCTION registro_clinico_imutavel();
  `);
  // Fechar o caixa de novo depois de reaberto: zera a reabertura e refaz a fotografia (UPDATE permitido);
  // o fechamento nunca é apagado.
  await knex.raw(`
    CREATE FUNCTION caixa_sem_exclusao() RETURNS trigger AS $$
    BEGIN
      RAISE EXCEPTION 'fechamento de caixa não pode ser excluído';
    END;
    $$ LANGUAGE plpgsql;
    CREATE TRIGGER caixas_diarios_sem_exclusao BEFORE DELETE ON caixas_diarios
      FOR EACH ROW EXECUTE FUNCTION caixa_sem_exclusao();
  `);

  // Links de uso único também servem recibo e extrato em PDF.
  await knex.raw('ALTER TABLE links_download DROP CONSTRAINT links_tipo_chk');
  await knex.raw(
    "ALTER TABLE links_download ADD CONSTRAINT links_tipo_chk CHECK (tipo IN ('anexo','prontuario_pdf','recibo_pdf','extrato_pdf'))",
  );
  await knex.raw('ALTER TABLE links_download ADD COLUMN parametro text');
};

exports.down = async (knex) => {
  await knex.raw('ALTER TABLE links_download DROP COLUMN IF EXISTS parametro');
  await knex.raw("DELETE FROM links_download WHERE tipo IN ('recibo_pdf','extrato_pdf')");
  await knex.raw('ALTER TABLE links_download DROP CONSTRAINT links_tipo_chk');
  await knex.raw(
    "ALTER TABLE links_download ADD CONSTRAINT links_tipo_chk CHECK (tipo IN ('anexo','prontuario_pdf'))",
  );
  await knex.schema.dropTableIfExists('lancamento_baixas');
  await knex.raw('DROP FUNCTION IF EXISTS baixa_aplicar()');
  await knex.schema.dropTableIfExists('caixas_diarios');
  await knex.raw('DROP FUNCTION IF EXISTS caixa_sem_exclusao()');
  await knex.schema.dropTableIfExists('lancamentos');
  await knex.schema.dropTableIfExists('categorias_financeiras');
};
