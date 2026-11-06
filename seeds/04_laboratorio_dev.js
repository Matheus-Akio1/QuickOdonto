const { cifrar, hashBusca } = require('../src/lib/crypto');

/**
 * Seed de DESENVOLVIMENTO do laboratório: a clínica própria + 3 clientes externos, preços
 * e ordens de serviço em várias etapas. Não roda de novo se já houver OS.
 */
function gerarCnpj(base) {
  const d = `${String(base).padStart(8, '0')}0001`.split('').map(Number);
  const dv = (arr) => {
    let peso = arr.length - 7;
    const soma = arr.reduce((acc, n) => {
      const r = acc + n * peso;
      peso = peso === 2 ? 9 : peso - 1;
      return r;
    }, 0);
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  d.push(dv(d));
  d.push(dv(d));
  return d.join('');
}

function gerarCpf(base) {
  const d = String(base).padStart(9, '0').split('').map(Number);
  const dv = (arr) => {
    const r = (arr.reduce((acc, n, i) => acc + n * (arr.length + 1 - i), 0) * 10) % 11;
    return r === 10 ? 0 : r;
  };
  d.push(dv(d));
  d.push(dv(d));
  return d.join('');
}

const doc = (valor, tipo) => ({
  documento_tipo: tipo,
  documento_cifrado: cifrar(valor),
  documento_hash: hashBusca(valor),
});

const CLIENTES = [
  {
    tipo: 'interno',
    razao_social: 'QuickOdonto Clínica Odontológica',
    ...doc(gerarCnpj(12345678), 'cnpj'),
    responsavel: 'Dentista Dev',
    cro: 'CRO-SP 90001',
    telefone: '1130251180',
    endereco: { cidade: 'São Paulo', uf: 'SP' },
    condicao_pagamento: 'Fechamento mensal, dia 10',
  },
  {
    tipo: 'externo',
    razao_social: 'Clínica Sorriso Vivo',
    ...doc(gerarCnpj(45902331), 'cnpj'),
    responsavel: 'Dra. Renata Kruger',
    cro: 'CRO-SP 21877',
    telefone: '1130334412',
    endereco: { cidade: 'Osasco', uf: 'SP' },
    condicao_pagamento: '30 dias',
  },
  {
    tipo: 'externo',
    razao_social: 'Odonto Center Bela Vista',
    ...doc(gerarCnpj(78517044), 'cnpj'),
    responsavel: 'Dr. Paulo Menezes',
    cro: 'CRO-SP 15630',
    telefone: '1132229087',
    endereco: { cidade: 'São Paulo', uf: 'SP' },
    condicao_pagamento: '30/60 dias',
  },
  {
    tipo: 'externo',
    razao_social: 'Dr. Marcos Tavares',
    ...doc(gerarCpf(318774219), 'cpf'),
    cro: 'CRO-SP 24115',
    telefone: '11998127740',
    endereco: { cidade: 'Guarulhos', uf: 'SP' },
    condicao_pagamento: 'À vista',
  },
];

const PRECOS = [
  ['Coroa metalocerâmica', 320],
  ['Coroa de zircônia', 480],
  ['Prótese total superior', 650],
  ['Prótese total inferior', 650],
  ['PPR superior', 540],
  ['PPR inferior', 540],
  ['Protocolo inferior', 2400],
  ['Faceta', 420],
  ['Placa miorrelaxante', 180],
  ['Ponte fixa', 900],
];

exports.seed = async (knex) => {
  for (const c of CLIENTES) {
    const existe =
      c.tipo === 'interno'
        ? await knex('laboratorio_clientes').where({ tipo: 'interno' }).first()
        : await knex('laboratorio_clientes').where({ documento_hash: c.documento_hash }).first();
    if (existe && c.tipo === 'interno' && !existe.documento_hash) {
      await knex('laboratorio_clientes')
        .where({ id: existe.id })
        .update({ ...c, endereco: JSON.stringify(c.endereco) });
    } else if (!existe) {
      await knex('laboratorio_clientes').insert({ ...c, endereco: JSON.stringify(c.endereco) });
    }
  }
  for (const [tipo_trabalho, valor] of PRECOS) {
    await knex.raw(
      `INSERT INTO tabela_precos (tipo_trabalho, valor) VALUES (?, ?)
       ON CONFLICT (lower(tipo_trabalho), COALESCE(cliente_id, '00000000-0000-0000-0000-000000000000'::uuid), vigencia_inicio)
       DO NOTHING`,
      [tipo_trabalho, valor],
    );
  }
  await knex('perfis_permissoes')
    .where({ perfil: 'laboratorio' })
    .whereIn('chave', ['criar_os_externa', 'cancelar_os'])
    .update({ habilitado: true });

  if (await knex('ordens_servico').first()) return;

  const usuario = (email) => knex('usuarios').where({ email }).first();
  const tec = await usuario('laboratorio@quickodonto.test');
  const adml = await usuario('adm.laboratorio@quickodonto.test');
  const pacientes = await knex('pacientes').where({ ativo: true }).orderBy('numero_prontuario');
  const profs = await knex('profissionais').orderBy('criado_em');
  const interno = await knex('laboratorio_clientes').where({ tipo: 'interno' }).first();
  const ext = await knex('laboratorio_clientes').where({ tipo: 'externo' }).orderBy('razao_social');
  if (!tec || !adml || pacientes.length < 7 || !profs.length) return;

  const dia = (n) => knex.raw("(now() AT TIME ZONE 'America/Sao_Paulo')::date + ?::int", [n]);
  // [paciente, tipo, elementos, etapa da clínica, etapa de produção, prazo em dias, técnico, concluída?]
  // A OS da clínica é gerada pelo dentista e já nasce enviada ao laboratório ("envio"/"recebida").
  const PROPRIAS = [
    [0, 'Prótese total superior', [], 'envio', 'recebida', 15, null],
    [1, 'Placa miorrelaxante', [], 'envio', 'recebida', 7, null],
    [2, 'Coroa metalocerâmica', [46], 'envio', 'recebida', 9, null],
    [3, 'Protocolo inferior', [], 'laboratorio', 'estrutura', -4, tec.id],
    [4, 'Coroa de zircônia', [11], 'laboratorio', 'acabamento', 2, adml.id],
    [5, 'PPR superior', [], 'laboratorio', 'modelo', 12, adml.id],
    [6, 'Prótese total inferior', [], 'retorno', 'prova', 5, tec.id],
    [0, 'Faceta', [21], 'concluida', 'enviada', -3, tec.id, true],
  ];
  const EXTERNAS = [
    [0, 'Antônio Prado', 'Prótese total superior', [], 'recebida', 14, null],
    [0, 'Sandra Reis', 'Coroa metalocerâmica', [36], 'modelo', 11, adml.id],
    [1, 'Márcia Vieira', 'Coroa de zircônia', [14], 'modelo', 3, tec.id],
    [2, 'Sérgio Bastos', 'Ponte fixa', [24, 25, 26], 'estrutura', 6, adml.id],
    [0, 'Dalva Ramos', 'PPR inferior', [], 'acabamento', 1, tec.id],
    [1, 'Iara Nunes', 'Faceta', [12, 22], 'pronta', 4, adml.id],
    [2, 'Elias Moura', 'Coroa metalocerâmica', [25], 'enviada', 2, tec.id],
  ];

  await knex.transaction(async (trx) => {
    // O trigger de histórico (RN-012) exige o usuário identificado na transação.
    const como = (id) => trx.raw("SELECT set_config('quickodonto.usuario_id', ?, true)", [id]);
    const preco = async (tipo) =>
      (await trx('tabela_precos').whereRaw('lower(tipo_trabalho) = lower(?)', [tipo]).first())
        ?.valor ?? null;
    const numero = (seq, prefixo) =>
      trx.raw(`'${prefixo}-' || lpad(nextval('${seq}')::text, 4, '0')`);

    for (const [p, tipo, elementos, etapa, producao, prazo, tecnico, concluida] of PROPRIAS) {
      const prof = profs[p % profs.length];
      await como(prof.usuario_id);
      const [os] = await trx('ordens_servico')
        .insert({
          numero: numero('os_numero_propria_seq', 'OS'),
          origem: 'propria',
          cliente_id: interno.id,
          paciente_id: pacientes[p].id,
          profissional_id: prof.id,
          tipo_trabalho: tipo,
          elementos,
          cor: 'A2',
          laboratorio: 'proprio',
          // Prazo já vencido só existe no seed (a API recusa data no passado).
          previsao_entrega: dia(prazo),
          valor: await preco(tipo),
          etapa: 'envio',
          etapa_producao: 'recebida',
          enviado_em: trx.fn.now(),
          criado_por: prof.usuario_id,
        })
        .returning('id');
      if (producao === 'recebida') continue;
      await como(tec.id);
      await trx('ordens_servico')
        .where({ id: os.id })
        .update({
          etapa_producao: producao,
          etapa: concluida ? 'retorno' : etapa,
          tecnico_id: tecnico,
        });
      if (producao === 'prova') {
        await trx('os_provas').insert({ os_id: os.id, numero: 1, usuario_id: tec.id });
      }
      if (concluida) {
        await trx('ordens_servico')
          .where({ id: os.id })
          .update({ etapa: 'concluida', status: 'concluida', concluida_em: trx.fn.now() });
      }
    }

    for (const [c, paciente, tipo, elementos, producao, prazo, tecnico] of EXTERNAS) {
      await como(tec.id);
      const [os] = await trx('ordens_servico')
        .insert({
          numero: numero('os_numero_externa_seq', 'L'),
          origem: 'externa',
          cliente_id: ext[c].id,
          paciente_nome: paciente,
          dentista_nome: ext[c].responsavel || ext[c].razao_social,
          tipo_trabalho: tipo,
          elementos,
          previsao_entrega: dia(prazo),
          valor: await preco(tipo),
          etapa_producao: 'recebida',
          enviado_em: trx.fn.now(),
          criado_por: tec.id,
        })
        .returning('id');
      if (producao !== 'recebida') {
        await trx('ordens_servico')
          .where({ id: os.id })
          .update({ etapa_producao: producao, tecnico_id: tecnico });
      }
      if (paciente === 'Dalva Ramos') {
        await trx('os_refacoes').insert({
          os_id: os.id,
          numero: 1,
          motivo: 'Grampo sem retenção no 34',
          usuario_id: tec.id,
        });
      }
    }
  });
};
