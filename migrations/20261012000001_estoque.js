/**
 * M5 — Estoque (por unidade: clínica e laboratório).
 *
 * Classificação dos campos (seção 3.1): nada sensível aqui — produto, lote, saldo, custo, fornecedor
 * e número de nota fiscal ficam em claro (entram em filtro, soma e relatório). Motivo e justificativa
 * são texto curto sobre o material, sem dado de paciente.
 *
 * Regras garantidas no banco:
 *  - RN-005: o saldo de um lote nunca fica negativo (CHECK) — a retirada que estouraria é recusada
 *  - RN-008: todo produto pertence a uma unidade; o código é único dentro dela
 *  - movimentações são imutáveis (entrada, retirada e ajuste nunca são editados nem apagados)
 *  - ajuste de inventário exige justificativa (CHECK)
 */
const ts = (t, knex) => {
  t.timestamp('criado_em', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  t.timestamp('atualizado_em', { useTz: true }).notNullable().defaultTo(knex.fn.now());
};

exports.up = async (knex) => {
  await knex.schema.createTable('produtos', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.text('unidade').notNullable();
    t.text('nome').notNullable();
    t.text('codigo').notNullable();
    t.text('categoria');
    t.text('unidade_medida').notNullable();
    t.decimal('estoque_minimo', 12, 3).notNullable().defaultTo(0);
    t.text('fornecedor');
    t.decimal('custo_medio', 12, 4).notNullable().defaultTo(0);
    t.boolean('ativo').notNullable().defaultTo(true);
    ts(t, knex);
    t.unique(['unidade', 'codigo']);
    t.index(['unidade', 'nome']);
  });
  await knex.raw(`ALTER TABLE produtos
    ADD CONSTRAINT produtos_unidade_chk CHECK (unidade IN ('clinica','laboratorio')),
    ADD CONSTRAINT produtos_valores_chk CHECK (estoque_minimo >= 0 AND custo_medio >= 0)`);

  await knex.schema.createTable('lotes', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('produto_id').notNullable().references('id').inTable('produtos');
    t.text('lote').notNullable();
    t.date('validade');
    t.decimal('saldo', 12, 3).notNullable().defaultTo(0);
    ts(t, knex);
    t.unique(['produto_id', 'lote']);
    t.index(['validade']);
  });
  // RN-005 — saldo negativo é impossível, mesmo com duas retiradas ao mesmo tempo.
  await knex.raw('ALTER TABLE lotes ADD CONSTRAINT lotes_saldo_rn005_chk CHECK (saldo >= 0)');

  await knex.schema.createTable('estoque_movimentacoes', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('produto_id').notNullable().references('id').inTable('produtos');
    t.uuid('lote_id').notNullable().references('id').inTable('lotes');
    t.text('tipo').notNullable();
    // Entrada e retirada: sempre positiva. Ajuste: diferença com sinal (contado − saldo).
    t.decimal('quantidade', 12, 3).notNullable();
    t.decimal('saldo_apos', 12, 3).notNullable();
    t.decimal('custo', 12, 4).notNullable().defaultTo(0); // custo unitário no momento
    t.uuid('os_id').references('id').inTable('ordens_servico');
    t.text('motivo');
    t.text('justificativa');
    t.text('fornecedor');
    t.text('nota_fiscal');
    t.uuid('usuario_id').references('id').inTable('usuarios').onDelete('SET NULL');
    t.timestamp('em', { useTz: true }).notNullable().defaultTo(knex.raw('clock_timestamp()'));
    ts(t, knex);
    t.index(['produto_id', 'em']);
    t.index(['tipo', 'em']);
    t.index(['os_id']);
  });
  await knex.raw(`ALTER TABLE estoque_movimentacoes
    ADD CONSTRAINT mov_tipo_chk CHECK (tipo IN ('entrada','retirada','ajuste')),
    ADD CONSTRAINT mov_quantidade_chk CHECK (
      (tipo IN ('entrada','retirada') AND quantidade > 0) OR (tipo = 'ajuste' AND quantidade <> 0)),
    ADD CONSTRAINT mov_motivo_chk CHECK (
      motivo IS NULL OR motivo IN ('producao','uso','perda','refacao','vencimento')),
    ADD CONSTRAINT mov_ajuste_chk CHECK (
      tipo <> 'ajuste' OR (justificativa IS NOT NULL AND length(trim(justificativa)) >= 5)),
    ADD CONSTRAINT mov_os_chk CHECK (os_id IS NULL OR tipo = 'retirada'),
    ADD CONSTRAINT mov_custo_chk CHECK (custo >= 0 AND saldo_apos >= 0)`);
  await knex.raw(`CREATE TRIGGER estoque_movimentacoes_imutavel BEFORE UPDATE OR DELETE ON estoque_movimentacoes
    FOR EACH ROW EXECUTE FUNCTION registro_clinico_imutavel()`);
};

exports.down = async (knex) => {
  await knex.schema.dropTableIfExists('estoque_movimentacoes');
  await knex.schema.dropTableIfExists('lotes');
  await knex.schema.dropTableIfExists('produtos');
};
