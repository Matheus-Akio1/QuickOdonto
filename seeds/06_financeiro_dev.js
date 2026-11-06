/**
 * Seed de DESENVOLVIMENTO do financeiro: lançamentos das duas unidades nas últimas semanas,
 * com parte recebida/paga (baixas) e parte em aberto. Não roda de novo se já houver lançamento.
 */
const HOJE = "(now() AT TIME ZONE 'America/Sao_Paulo')::date";

// [tipo, chave da categoria, descrição, valor, vencimento (dias a partir de hoje), baixa: [dias, forma, valor?]]
const CLINICA = [
  ['receita', 'tratamento', 'Mariana Souza Lima · parcela 1/3', 850, -9, [-9, 'pix']],
  ['receita', 'tratamento', 'Carlos Eduardo Pereira · canal', 1200, -8, [-8, 'credito']],
  ['receita', 'tratamento', 'Fernanda Alves Rocha · profilaxia', 180, -6, [-6, 'debito']],
  ['receita', 'tratamento', 'João Pedro Martins · restauração', 320, -3, [-3, 'dinheiro']],
  ['receita', 'tratamento', 'Luciana Barbosa · clareamento', 900, -1, [-1, 'pix', 400]],
  ['receita', 'tratamento', 'Rafael Nogueira · avaliação e limpeza', 300, 0, [0, 'pix']],
  ['receita', 'tratamento', 'Mariana Souza Lima · parcela 2/3', 850, 21, null],
  ['receita', 'tratamento', 'Patrícia Gomes · prótese total', 2400, 12, null],
  ['despesa', 'despesa_fixa', 'Aluguel da sala', 4800, -7, [-7, 'transferencia']],
  ['despesa', 'pessoal', 'Folha de pagamento', 6200, -5, [-5, 'transferencia']],
  ['despesa', 'estoque', 'Dental Sul · materiais', 1340, 4, null],
  ['despesa', 'protese_laboratorio', 'OS-0008 · Faceta · Lab. QuickOdonto', 420, 9, null],
  ['despesa', 'outras_despesas', 'Energia elétrica', 610, -2, null],
];
const LABORATORIO = [
  [
    'receita',
    'servicos_os',
    'Clínica Sorriso Vivo · serviços do mês',
    4250,
    -4,
    [-4, 'boleto', 2000],
  ],
  ['receita', 'servicos_os', 'Odonto Center Bela Vista · serviços do mês', 2310, 6, null],
  ['receita', 'servicos_os', 'Dr. Marcos Tavares · serviços do mês', 2100, -10, [-10, 'pix']],
  ['receita', 'servicos_os', 'QuickOdonto · fechamento mensal', 3800, 10, null],
  ['despesa', 'estoque', 'Dental Metal · insumos', 2180, 5, null],
  ['despesa', 'despesa_fixa', 'Energia elétrica', 860, 8, null],
  ['despesa', 'manutencao', 'Manutenção da fresadora', 1080, 12, null],
  ['despesa', 'pessoal', 'Folha de pagamento', 5400, -5, [-5, 'transferencia']],
  ['despesa', 'estoque', 'Dental Sul · resinas e ceras', 1260, -11, [-11, 'boleto']],
];

exports.seed = async (knex) => {
  if (await knex('lancamentos').first()) return;
  const usuario = async (email) => (await knex('usuarios').where({ email }).first())?.id ?? null;
  const clientes = await knex('laboratorio_clientes').select('id', 'razao_social');
  const unidades = [
    ['clinica', CLINICA, await usuario('adm.clinica@quickodonto.test')],
    ['laboratorio', LABORATORIO, await usuario('adm.laboratorio@quickodonto.test')],
  ];
  const data = (n) => knex.raw(`${HOJE} + ?::int`, [n]);

  for (const [unidade, itens, criado_por] of unidades) {
    const cats = Object.fromEntries(
      (await knex('categorias_financeiras').where({ unidade })).map((c) => [c.chave, c.id]),
    );
    for (const [tipo, chave, descricao, valor, venc, baixa] of itens) {
      const cliente =
        unidade === 'laboratorio' && tipo === 'receita'
          ? clientes.find((c) => descricao.startsWith(c.razao_social.split(' ')[0]))
          : null;
      const [l] = await knex('lancamentos')
        .insert({
          unidade,
          tipo,
          categoria_id: cats[chave],
          descricao,
          valor,
          vencimento: data(venc),
          cliente_id: cliente?.id ?? null,
          criado_por,
        })
        .returning('id');
      if (baixa) {
        // O trigger atualiza valor pago e situação do título.
        await knex('lancamento_baixas').insert({
          lancamento_id: l.id,
          valor: baixa[2] ?? valor,
          data: data(baixa[0]),
          forma: baixa[1],
          usuario_id: criado_por,
        });
      }
    }
  }
};
