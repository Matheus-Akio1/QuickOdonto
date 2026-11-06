/**
 * Seed de DESENVOLVIMENTO do estoque: os produtos das pranchas do protótipo, nas duas unidades,
 * cada um com um lote e a entrada que o originou. Não roda de novo se já houver produto.
 */
// [nome, categoria, código, unidade de medida, mínimo, saldo, custo, validade em dias (ou null), fornecedor]
const LABORATORIO = [
  ['Gesso especial tipo IV', 'Gessos', 'G4-0825', 'kg', 10, 18, 42, 500, 'Dental Gesso'],
  [
    'Resina acrílica termopolimerizável',
    'Resinas',
    'RA-1102',
    'g',
    1000,
    450,
    0.18,
    390,
    'Dental Sul',
  ],
  ['Dentes de estoque (jogo)', 'Dentes', 'DT-0713', 'jogos', 8, 6, 96, null, 'Dental Sul'],
  ['Disco de zircônia 98 mm', 'CAD/CAM', 'ZR-0340', 'un', 3, 4, 320, null, 'CAD Brasil'],
  ['Liga Ni-Cr', 'Metais', 'NC-0918', 'g', 500, 320, 1.9, null, 'Dental Metal'],
  ['Cerâmica feldspática dentina A2', 'Cerâmicas', 'CF-0520', 'g', 40, 60, 3.4, 20, 'Dental Sul'],
  ['Isolante para gesso', 'Auxiliares', 'IS-0611', 'L', 1, 2, 28, 12, 'Dental Gesso'],
  ['Cera nº 7', 'Ceras', 'CE-0707', 'cx', 4, 9, 34, null, 'Dental Sul'],
];
const CLINICA = [
  ['Anestésico lidocaína 2%', 'Medicamentos', 'AN-2209', 'tubetes', 20, 8, 2.4, 540, 'Dental Sul'],
  ['Luvas de procedimento M', 'Descartáveis', 'LV-0815', 'caixas', 5, 3, 38.9, null, 'Dental Sul'],
  ['Resina composta A2', 'Dentística', 'RC-1140', 'seringas', 4, 2, 96, 600, 'Dental Sul'],
  [
    'Agulha gengival 30G curta',
    'Descartáveis',
    'AG-0422',
    'caixas',
    10,
    24,
    21.5,
    690,
    'Dental Sul',
  ],
  ['Broca diamantada 1014', 'Instrumentais', 'BR-0930', 'un', 8, 12, 12.8, null, 'Dental Sul'],
  ['Ácido fosfórico 37%', 'Dentística', 'AC-0612', 'seringas', 3, 5, 18.2, 15, 'Dental Sul'],
  ['Sugador descartável', 'Descartáveis', 'SG-0201', 'pacotes', 3, 6, 14, null, 'Dental Sul'],
  ['Álcool 70%', 'Higiene', 'AL-0333', 'L', 2, 4, 9.6, 480, 'Dental Sul'],
];

exports.seed = async (knex) => {
  await knex('perfis_permissoes')
    .where({ perfil: 'laboratorio', chave: 'entrada_estoque' })
    .update({ habilitado: true });
  if (await knex('produtos').first()) return;

  const adm = async (email) => (await knex('usuarios').where({ email }).first())?.id ?? null;
  const unidades = [
    ['laboratorio', LABORATORIO, await adm('adm.laboratorio@quickodonto.test')],
    ['clinica', CLINICA, await adm('adm.clinica@quickodonto.test')],
  ];
  for (const [unidade, itens, usuario_id] of unidades) {
    for (const [
      nome,
      categoria,
      codigo,
      unidade_medida,
      minimo,
      saldo,
      custo,
      dias,
      fornecedor,
    ] of itens) {
      const [p] = await knex('produtos')
        .insert({
          unidade,
          nome,
          categoria,
          codigo,
          unidade_medida,
          estoque_minimo: minimo,
          custo_medio: custo,
          fornecedor,
        })
        .returning('id');
      const [l] = await knex('lotes')
        .insert({
          produto_id: p.id,
          lote: codigo,
          validade:
            dias === null
              ? null
              : knex.raw("(now() AT TIME ZONE 'America/Sao_Paulo')::date + ?::int", [dias]),
          saldo,
        })
        .returning('id');
      await knex('estoque_movimentacoes').insert({
        produto_id: p.id,
        lote_id: l.id,
        tipo: 'entrada',
        quantidade: saldo,
        saldo_apos: saldo,
        custo,
        fornecedor,
        nota_fiscal: 'Saldo inicial',
        usuario_id,
      });
    }
  }
};
