/**
 * Contrato tipado (schemas de requisição/resposta) acoplado às rotas documentadas com @swagger.
 * O front gera seus tipos a partir daqui (openapi-typescript) — nenhum payload é tipado à mão.
 * Chave de `operacoes`: "<metodo> <caminho OpenAPI>".
 */
const ref = (nome) => ({ $ref: `#/components/schemas/${nome}` });
const refNulo = (nome) => ({ allOf: [ref(nome)], nullable: true });
const json = (schema) => ({ 'application/json': { schema } });
const pagina = (item) => ({
  type: 'object',
  required: ['itens', 'pagina', 'limite', 'total'],
  properties: {
    itens: { type: 'array', items: ref(item) },
    pagina: { type: 'integer' },
    limite: { type: 'integer' },
    total: { type: 'integer' },
  },
});
const str = { type: 'string' };
const strNull = { type: 'string', nullable: true };
const uuid = { type: 'string', format: 'uuid' };
const dt = { type: 'string', format: 'date-time' };
const perfil = {
  type: 'string',
  enum: ['secretaria', 'clinica', 'adm_clinica', 'laboratorio', 'adm_laboratorio'],
};
const unidade = { type: 'string', enum: ['clinica', 'laboratorio'] };
const statusConsulta = {
  type: 'string',
  enum: ['agendada', 'confirmada', 'chegou', 'em_atendimento', 'concluida', 'faltou', 'cancelada'],
};

const statusProcedimento = {
  type: 'string',
  enum: ['planejado', 'em_andamento', 'concluido', 'cancelado'],
};

const etapaOs = {
  type: 'string',
  enum: ['pre_laboratorio', 'envio', 'laboratorio', 'retorno', 'concluida'],
};
const etapaProducao = {
  type: 'string',
  enum: ['recebida', 'modelo', 'estrutura', 'prova', 'acabamento', 'pronta', 'enviada'],
};

const schemas = {
  Alerta: {
    type: 'object',
    required: ['tipo', 'descricao'],
    properties: {
      tipo: { type: 'string', enum: ['alergia', 'medicamento', 'condicao', 'outro'] },
      descricao: str,
    },
  },
  AnamneseMeta: {
    type: 'object',
    required: ['id', 'versao', 'criado_em', 'profissional_nome'],
    properties: {
      id: uuid,
      versao: { type: 'integer' },
      assinada_em: { ...dt, nullable: true },
      criado_em: dt,
      profissional_nome: str,
    },
  },
  Anamnese: {
    allOf: [
      ref('AnamneseMeta'),
      {
        type: 'object',
        required: ['paciente_id', 'respostas', 'alertas'],
        properties: {
          paciente_id: uuid,
          respostas: { type: 'object', additionalProperties: true },
          alertas: { type: 'array', items: ref('Alerta') },
        },
      },
    ],
  },
  Adendo: {
    type: 'object',
    required: ['id', 'conteudo', 'criado_em'],
    properties: { id: uuid, conteudo: str, criado_em: dt, profissional_nome: str },
  },
  Evolucao: {
    type: 'object',
    required: ['id', 'conteudo', 'criado_em', 'profissional_nome', 'adendos'],
    properties: {
      id: uuid,
      consulta_id: { ...uuid, nullable: true },
      conteudo: str,
      criado_em: dt,
      profissional_nome: str,
      adendos: { type: 'array', items: ref('Adendo') },
    },
  },
  ItemLinhaTempo: {
    type: 'object',
    required: ['tipo', 'id', 'em', 'titulo'],
    properties: {
      tipo: { type: 'string', enum: ['evolucao', 'anamnese', 'procedimento', 'anexo', 'consulta'] },
      id: uuid,
      em: dt,
      autor: strNull,
      titulo: str,
      resumo: strNull,
    },
  },
  Prontuario: {
    type: 'object',
    required: ['paciente', 'alertas', 'linha_do_tempo'],
    properties: {
      paciente: {
        type: 'object',
        required: ['id', 'nome', 'numero_prontuario', 'ativo'],
        properties: {
          id: uuid,
          nome: str,
          numero_prontuario: { type: 'integer' },
          nascimento: { type: 'string', format: 'date', nullable: true },
          sexo: strNull,
          ativo: { type: 'boolean' },
        },
      },
      anamnese_atual: { allOf: [ref('AnamneseMeta')], nullable: true },
      alertas: { type: 'array', items: ref('Alerta') },
      linha_do_tempo: { type: 'array', items: ref('ItemLinhaTempo') },
    },
  },
  Acesso: {
    type: 'object',
    required: ['em', 'recurso'],
    properties: { em: dt, recurso: str, usuario_nome: strNull, usuario_perfil: strNull },
  },
  ItemCatalogo: {
    type: 'object',
    required: ['id', 'codigo', 'nome', 'duracao_min', 'valor_padrao', 'ativo'],
    properties: {
      id: uuid,
      codigo: str,
      nome: str,
      especialidade: strNull,
      duracao_min: { type: 'integer' },
      valor_padrao: { type: 'number' },
      ativo: { type: 'boolean' },
    },
  },
  ProcedimentoPaciente: {
    type: 'object',
    required: ['id', 'paciente_id', 'catalogo', 'faces', 'status', 'valor', 'adendos', 'criado_em'],
    properties: {
      id: uuid,
      paciente_id: uuid,
      catalogo: {
        type: 'object',
        required: ['id', 'codigo', 'nome'],
        properties: { id: uuid, codigo: str, nome: str, especialidade: strNull },
      },
      dente: { type: 'integer', nullable: true },
      faces: { type: 'array', items: { type: 'string', enum: ['V', 'L', 'M', 'D', 'O', 'I'] } },
      status: statusProcedimento,
      data: { type: 'string', format: 'date', nullable: true },
      valor: { type: 'number' },
      observacao: strNull,
      profissional_nome: strNull,
      plano_id: { ...uuid, nullable: true },
      criado_em: dt,
      adendos: {
        type: 'array',
        items: {
          type: 'object',
          required: ['id', 'conteudo', 'criado_em'],
          properties: { id: uuid, conteudo: str, criado_em: dt, autor: strNull },
        },
      },
    },
  },
  Odontograma: {
    type: 'object',
    required: ['dentes'],
    properties: {
      dentes: {
        type: 'object',
        additionalProperties: {
          type: 'object',
          required: ['situacao', 'procedimentos'],
          properties: {
            situacao: {
              type: 'string',
              enum: ['planejado', 'em_andamento', 'concluido'],
              nullable: true,
            },
            procedimentos: {
              type: 'array',
              items: {
                type: 'object',
                required: ['id', 'nome', 'faces', 'status'],
                properties: {
                  id: uuid,
                  nome: str,
                  faces: { type: 'array', items: str },
                  status: statusProcedimento,
                  data: { type: 'string', format: 'date', nullable: true },
                },
              },
            },
          },
        },
      },
    },
  },
  PlanoTratamento: {
    type: 'object',
    required: ['id', 'paciente_id', 'status', 'total', 'itens', 'criado_em'],
    properties: {
      id: uuid,
      paciente_id: uuid,
      status: { type: 'string', enum: ['rascunho', 'aprovado'] },
      observacao: strNull,
      total: { type: 'number' },
      profissional_nome: strNull,
      criado_por_nome: strNull,
      criado_em: dt,
      aprovado_em: { ...dt, nullable: true },
      aprovado_por_nome: strNull,
      itens: {
        type: 'array',
        items: {
          type: 'object',
          required: ['id', 'catalogo', 'faces', 'valor'],
          properties: {
            id: uuid,
            catalogo: {
              type: 'object',
              required: ['id', 'codigo', 'nome'],
              properties: { id: uuid, codigo: str, nome: str },
            },
            dente: { type: 'integer', nullable: true },
            faces: { type: 'array', items: str },
            valor: { type: 'number' },
            procedimento_id: { ...uuid, nullable: true },
          },
        },
      },
    },
  },
  Anexo: {
    type: 'object',
    required: ['id', 'tipo', 'nome', 'mime', 'tamanho', 'criado_em'],
    properties: {
      id: uuid,
      paciente_id: { ...uuid, nullable: true },
      tipo: { type: 'string', enum: ['radiografia', 'foto', 'documento', 'escaneamento', 'outro'] },
      nome: str,
      mime: str,
      tamanho: { type: 'integer' },
      criado_em: dt,
      enviado_por: strNull,
    },
  },
  LinkDownload: {
    type: 'object',
    required: ['url', 'expira_em'],
    properties: { url: str, expira_em: dt },
  },
  Erro: { type: 'object', required: ['erro'], properties: { erro: str } },
  UsuarioSessao: {
    type: 'object',
    required: ['id', 'nome', 'perfil', 'unidade'],
    properties: { id: uuid, nome: str, perfil, unidade },
  },
  LoginResposta: {
    type: 'object',
    required: ['usuario', 'csrfToken'],
    properties: { usuario: ref('UsuarioSessao'), csrfToken: str },
  },
  CsrfResposta: { type: 'object', required: ['csrfToken'], properties: { csrfToken: str } },
  Me: {
    type: 'object',
    required: ['id', 'nome', 'perfil', 'unidade', 'permissoes', 'csrfToken'],
    properties: {
      id: uuid,
      nome: str,
      perfil,
      unidade,
      permissoes: { type: 'object', additionalProperties: { type: 'boolean' } },
      csrfToken: str,
    },
  },
  Usuario: {
    type: 'object',
    required: ['id', 'nome', 'email', 'perfil', 'unidade', 'status', 'criado_em'],
    properties: {
      id: uuid,
      nome: str,
      email: str,
      perfil,
      unidade,
      status: { type: 'string', enum: ['ativo', 'bloqueado', 'convidado'] },
      ultimo_acesso: { ...dt, nullable: true },
      criado_em: dt,
    },
  },
  PermissoesPerfil: {
    type: 'object',
    required: ['perfil', 'permissoes'],
    properties: {
      perfil: str,
      permissoes: { type: 'object', additionalProperties: { type: 'boolean' } },
    },
  },
  AuditoriaItem: {
    type: 'object',
    required: ['id', 'em', 'entidade', 'acao'],
    properties: {
      id: uuid,
      em: dt,
      entidade: str,
      entidade_id: strNull,
      acao: str,
      antes: { type: 'object', nullable: true, additionalProperties: true },
      depois: { type: 'object', nullable: true, additionalProperties: true },
      ip: strNull,
      usuario_nome: strNull,
    },
  },
  Notificacao: {
    type: 'object',
    required: ['id', 'tipo', 'titulo', 'criado_em'],
    properties: {
      id: uuid,
      tipo: str,
      titulo: str,
      link: strNull,
      lida_em: { ...dt, nullable: true },
      criado_em: dt,
    },
  },
  NotificacoesPagina: {
    type: 'object',
    required: ['itens', 'pagina', 'limite', 'nao_lidas'],
    properties: {
      itens: { type: 'array', items: ref('Notificacao') },
      pagina: { type: 'integer' },
      limite: { type: 'integer' },
      nao_lidas: { type: 'integer' },
    },
  },
  Endereco: {
    type: 'object',
    properties: {
      cep: str,
      logradouro: str,
      numero: str,
      complemento: str,
      bairro: str,
      cidade: str,
      uf: str,
    },
  },
  Responsavel: {
    type: 'object',
    required: ['nome'],
    properties: { nome: str, parentesco: strNull, celular: strNull },
  },
  Paciente: {
    type: 'object',
    required: ['id', 'numero_prontuario', 'nome', 'ativo', 'criado_em'],
    properties: {
      id: uuid,
      numero_prontuario: { type: 'integer' },
      nome: str,
      cpf: { ...str, nullable: true, description: 'Sempre mascarado' },
      nascimento: { type: 'string', format: 'date', nullable: true },
      sexo: { type: 'string', enum: ['F', 'M', 'O'], nullable: true },
      celular: { ...str, nullable: true, description: 'Sempre mascarado' },
      email: strNull,
      responsavel: refNulo('Responsavel'),
      origem: strNull,
      ativo: { type: 'boolean' },
      criado_em: dt,
      proxima_consulta: {
        type: 'object',
        nullable: true,
        required: ['inicio', 'status'],
        properties: { inicio: dt, status: statusConsulta },
        description: 'Só nas listagens',
      },
    },
  },
  Consentimento: {
    type: 'object',
    required: ['id', 'finalidade', 'forma', 'data'],
    properties: {
      id: uuid,
      finalidade: str,
      forma: { type: 'string', enum: ['presencial', 'digital', 'termo_assinado'] },
      data: dt,
    },
  },
  PacienteFicha: {
    allOf: [
      ref('Paciente'),
      {
        type: 'object',
        properties: {
          endereco: refNulo('Endereco'),
          observacoes: strNull,
          consentimentos: { type: 'array', items: ref('Consentimento') },
        },
      },
    ],
  },
  PacienteEntrada: {
    type: 'object',
    required: ['nome'],
    properties: {
      nome: str,
      cpf: strNull,
      nascimento: { type: 'string', format: 'date', nullable: true },
      sexo: { type: 'string', enum: ['F', 'M', 'O'], nullable: true },
      celular: strNull,
      email: strNull,
      endereco: refNulo('Endereco'),
      responsavel_nome: strNull,
      responsavel_parentesco: strNull,
      responsavel_celular: strNull,
      origem: strNull,
      observacoes: strNull,
    },
  },
  ConsultaProxima: {
    type: 'object',
    required: ['id', 'inicio', 'fim', 'status'],
    properties: {
      id: uuid,
      inicio: dt,
      fim: dt,
      status: statusConsulta,
      procedimento_previsto: strNull,
      profissional_nome: str,
    },
  },
  PacienteResumo: {
    type: 'object',
    required: ['paciente', 'proximas_consultas', 'os_em_aberto'],
    properties: {
      paciente: ref('Paciente'),
      proximas_consultas: { type: 'array', items: ref('ConsultaProxima') },
      os_em_aberto: { type: 'array', items: ref('OsResumoPaciente') },
    },
  },
  CampoRevelado: {
    type: 'object',
    required: ['campo', 'valor'],
    properties: { campo: str, valor: strNull },
  },
  Profissional: {
    type: 'object',
    required: ['id', 'usuario_id', 'nome', 'cro', 'cor_agenda', 'ativo'],
    properties: {
      id: uuid,
      usuario_id: uuid,
      nome: str,
      cro: str,
      especialidade: strNull,
      cor_agenda: str,
      ativo: { type: 'boolean' },
    },
  },
  Horario: {
    type: 'object',
    required: ['dia_semana', 'inicio', 'fim'],
    properties: { dia_semana: { type: 'integer', minimum: 0, maximum: 6 }, inicio: str, fim: str },
  },
  Horarios: {
    type: 'object',
    required: ['horarios'],
    properties: { horarios: { type: 'array', items: ref('Horario') } },
  },
  HistoricoConsulta: {
    type: 'object',
    required: ['para_status', 'em'],
    properties: {
      de_status: strNull,
      para_status: statusConsulta,
      observacao: strNull,
      em: dt,
      usuario_nome: strNull,
    },
  },
  Consulta: {
    type: 'object',
    required: ['id', 'inicio', 'fim', 'cadeira', 'status', 'paciente', 'profissional'],
    properties: {
      id: uuid,
      inicio: dt,
      fim: dt,
      cadeira: { type: 'integer' },
      status: statusConsulta,
      procedimento_previsto: strNull,
      motivo_cancelamento: strNull,
      status_desde: { ...dt, nullable: true },
      paciente: { type: 'object', required: ['id', 'nome'], properties: { id: uuid, nome: str } },
      profissional: {
        type: 'object',
        required: ['id', 'nome', 'cor_agenda'],
        properties: { id: uuid, nome: str, cor_agenda: str },
      },
      historico: { type: 'array', items: ref('HistoricoConsulta') },
    },
  },
  Bloqueio: {
    type: 'object',
    required: ['id', 'inicio', 'fim', 'motivo'],
    properties: {
      id: uuid,
      profissional_id: { ...uuid, nullable: true },
      profissional_nome: strNull,
      inicio: dt,
      fim: dt,
      motivo: str,
    },
  },
  Disponibilidade: {
    type: 'object',
    required: ['profissional', 'data', 'duracao', 'livres'],
    properties: {
      profissional: uuid,
      data: str,
      duracao: { type: 'integer' },
      livres: {
        type: 'array',
        items: { type: 'object', required: ['inicio', 'fim'], properties: { inicio: dt, fim: dt } },
      },
    },
  },
  Lembrete: {
    type: 'object',
    required: ['url', 'celular'],
    properties: { url: str, celular: { ...str, description: 'Mascarado' } },
  },
  OsPessoa: {
    type: 'object',
    required: ['nome'],
    properties: { id: { ...uuid, nullable: true }, nome: str },
  },
  OrdemServico: {
    type: 'object',
    required: [
      'id',
      'numero',
      'origem',
      'status',
      'tipo_trabalho',
      'elementos',
      'cliente',
      'paciente',
      'prazo',
      'refacoes',
      'provas',
      'prova_aberta',
      'criado_em',
    ],
    properties: {
      id: uuid,
      numero: str,
      origem: { type: 'string', enum: ['propria', 'externa'] },
      status: { type: 'string', enum: ['aberta', 'concluida', 'cancelada'] },
      etapa: { ...etapaOs, nullable: true },
      etapa_producao: { ...etapaProducao, nullable: true },
      tipo_trabalho: str,
      elementos: { type: 'array', items: { type: 'integer' } },
      cor: strNull,
      material: strNull,
      laboratorio: { type: 'string', enum: ['proprio'], nullable: true },
      previsao_entrega: { type: 'string', format: 'date', nullable: true },
      enviado_em: { ...dt, nullable: true },
      concluida_em: { ...dt, nullable: true },
      cancelada_em: { ...dt, nullable: true },
      motivo_cancelamento: strNull,
      criado_em: dt,
      cliente: {
        type: 'object',
        required: ['id', 'nome', 'tipo'],
        properties: { id: uuid, nome: str, tipo: { type: 'string', enum: ['interno', 'externo'] } },
      },
      paciente: ref('OsPessoa'),
      dentista: refNulo('OsPessoa'),
      tecnico: {
        type: 'object',
        nullable: true,
        required: ['id', 'nome'],
        properties: { id: uuid, nome: str },
      },
      prazo: {
        type: 'object',
        required: ['situacao'],
        properties: {
          situacao: {
            type: 'string',
            enum: ['atrasada', 'a_vencer', 'no_prazo', 'sem_prazo', 'concluida', 'cancelada'],
          },
          dias: { type: 'integer', nullable: true },
        },
      },
      refacoes: { type: 'integer' },
      provas: { type: 'integer' },
      prova_aberta: { type: 'boolean' },
      valor: {
        type: 'number',
        nullable: true,
        description: 'Só para a administração do laboratório',
      },
      observacoes: strNull,
    },
  },
  OsProva: {
    type: 'object',
    required: ['id', 'numero', 'enviada_em'],
    properties: {
      id: uuid,
      numero: { type: 'integer' },
      enviada_em: dt,
      devolvida_em: { ...dt, nullable: true },
      resultado: { type: 'string', enum: ['aprovada', 'ajuste'], nullable: true },
      motivo: strNull,
      usuario_nome: strNull,
    },
  },
  OsRefacao: {
    type: 'object',
    required: ['id', 'numero', 'motivo', 'data'],
    properties: {
      id: uuid,
      numero: { type: 'integer' },
      motivo: str,
      data: dt,
      usuario_nome: strNull,
    },
  },
  OrdemServicoDetalhe: {
    allOf: [
      ref('OrdemServico'),
      {
        type: 'object',
        required: ['historico_provas', 'historico_refacoes'],
        properties: {
          historico_provas: { type: 'array', items: ref('OsProva') },
          historico_refacoes: { type: 'array', items: ref('OsRefacao') },
        },
      },
    ],
  },
  OsHistorico: {
    type: 'object',
    required: ['lado', 'para_etapa', 'em'],
    properties: {
      lado: { type: 'string', enum: ['clinica', 'laboratorio', 'status'] },
      de_etapa: strNull,
      para_etapa: str,
      observacao: strNull,
      em: dt,
      usuario_nome: strNull,
    },
  },
  OsAnexo: {
    type: 'object',
    required: ['id', 'os_id', 'tipo', 'nome', 'mime', 'tamanho', 'criado_em'],
    properties: {
      id: uuid,
      os_id: uuid,
      tipo: str,
      nome: str,
      mime: str,
      tamanho: { type: 'integer' },
      criado_em: dt,
      enviado_por: strNull,
    },
  },
  OsEntrada: {
    type: 'object',
    required: ['tipo_trabalho'],
    properties: {
      tipo_trabalho: str,
      elementos: { type: 'array', items: { type: 'integer' } },
      cor: strNull,
      material: strNull,
      observacoes: strNull,
      previsao_entrega: { type: 'string', format: 'date', nullable: true },
      paciente_id: uuid,
      profissional_id: { ...uuid, nullable: true },
      laboratorio: { type: 'string', enum: ['proprio'], nullable: true },
      cliente_id: uuid,
      paciente_nome: str,
      dentista_nome: strNull,
    },
  },
  LabCliente: {
    type: 'object',
    required: ['id', 'tipo', 'razao_social', 'ativo', 'os_abertas', 'criado_em'],
    properties: {
      id: uuid,
      tipo: { type: 'string', enum: ['interno', 'externo'] },
      razao_social: str,
      documento_tipo: { type: 'string', enum: ['cnpj', 'cpf'], nullable: true },
      documento: { ...strNull, description: 'Mascarado' },
      responsavel: strNull,
      cro: strNull,
      telefone: { ...strNull, description: 'Mascarado' },
      email: strNull,
      endereco: refNulo('Endereco'),
      condicao_pagamento: strNull,
      ativo: { type: 'boolean' },
      criado_em: dt,
      os_abertas: { type: 'integer' },
    },
  },
  LabClienteEntrada: {
    type: 'object',
    properties: {
      razao_social: str,
      documento: strNull,
      responsavel: strNull,
      cro: strNull,
      telefone: strNull,
      email: strNull,
      endereco: refNulo('Endereco'),
      condicao_pagamento: strNull,
      ativo: { type: 'boolean' },
    },
  },
  LabCaderno: {
    type: 'object',
    required: ['cliente', 'indicadores', 'em_producao', 'entregues'],
    properties: {
      cliente: ref('LabCliente'),
      indicadores: {
        type: 'object',
        required: ['os_abertas', 'entregues_mes', 'refacoes_mes'],
        properties: {
          os_abertas: { type: 'integer' },
          entregues_mes: { type: 'integer' },
          no_prazo_pct: { type: 'integer', nullable: true },
          refacoes_mes: { type: 'integer' },
        },
      },
      em_producao: { type: 'array', items: ref('OrdemServico') },
      entregues: { type: 'array', items: ref('OrdemServico') },
    },
  },
  Preco: {
    type: 'object',
    required: ['id', 'tipo_trabalho', 'valor', 'vigencia_inicio'],
    properties: {
      id: uuid,
      tipo_trabalho: str,
      cliente_id: { ...uuid, nullable: true },
      cliente_nome: strNull,
      valor: { type: 'number' },
      vigencia_inicio: { type: 'string', format: 'date' },
    },
  },
  OsResumoPaciente: {
    type: 'object',
    required: ['id', 'numero', 'tipo_trabalho', 'etapa'],
    properties: {
      id: uuid,
      numero: str,
      tipo_trabalho: str,
      etapa: etapaOs,
      previsao_entrega: { type: 'string', format: 'date', nullable: true },
    },
  },
  Lote: {
    type: 'object',
    required: ['id', 'lote', 'saldo'],
    properties: {
      id: uuid,
      lote: str,
      validade: { type: 'string', format: 'date', nullable: true },
      saldo: { type: 'number' },
    },
  },
  Produto: {
    type: 'object',
    required: [
      'id',
      'nome',
      'codigo',
      'unidade_medida',
      'estoque_minimo',
      'ativo',
      'saldo',
      'situacao',
      'lotes',
    ],
    properties: {
      id: uuid,
      nome: str,
      codigo: str,
      categoria: strNull,
      unidade_medida: str,
      estoque_minimo: { type: 'number' },
      fornecedor: strNull,
      ativo: { type: 'boolean' },
      saldo: { type: 'number' },
      situacao: { type: 'string', enum: ['abaixo_minimo', 'vencido', 'vencendo', 'normal'] },
      proxima_validade: { type: 'string', format: 'date', nullable: true },
      lotes: { type: 'array', items: ref('Lote') },
      custo_medio: { type: 'number', description: 'Só para a administração' },
      valor: { type: 'number', description: 'Só para a administração' },
    },
  },
  ProdutoEntrada: {
    type: 'object',
    properties: {
      nome: str,
      codigo: str,
      categoria: strNull,
      unidade_medida: str,
      estoque_minimo: { type: 'number' },
      fornecedor: strNull,
      ativo: { type: 'boolean' },
    },
  },
  Movimentacao: {
    type: 'object',
    required: ['id', 'tipo', 'quantidade', 'saldo_apos', 'em', 'produto', 'lote'],
    properties: {
      id: uuid,
      tipo: { type: 'string', enum: ['entrada', 'retirada', 'ajuste'] },
      quantidade: { type: 'number' },
      saldo_apos: { type: 'number' },
      custo: { type: 'number', description: 'Só para a administração' },
      motivo: {
        type: 'string',
        enum: ['producao', 'uso', 'perda', 'refacao', 'vencimento'],
        nullable: true,
      },
      justificativa: strNull,
      fornecedor: strNull,
      nota_fiscal: strNull,
      em: dt,
      produto: {
        type: 'object',
        required: ['id', 'nome', 'unidade_medida'],
        properties: { id: uuid, nome: str, unidade_medida: str },
      },
      lote: str,
      usuario_nome: strNull,
      os: {
        type: 'object',
        nullable: true,
        required: ['id', 'numero'],
        properties: { id: uuid, numero: str },
      },
    },
  },
  EstoqueResumo: {
    type: 'object',
    required: ['abaixo_minimo', 'lotes_vencendo', 'retiradas_hoje', 'retiradas_hoje_os'],
    properties: {
      abaixo_minimo: { type: 'integer' },
      lotes_vencendo: { type: 'integer' },
      retiradas_hoje: { type: 'integer' },
      retiradas_hoje_os: { type: 'integer' },
      valor_estoque: { type: 'number' },
      consumo_mes: { type: 'number' },
      os_no_mes: { type: 'integer' },
    },
  },
  CustoPorOs: {
    type: 'object',
    properties: {
      ranking: {
        type: 'array',
        items: {
          type: 'object',
          required: ['id', 'numero', 'tipo_trabalho', 'total', 'retiradas'],
          properties: {
            id: uuid,
            numero: str,
            tipo_trabalho: str,
            total: { type: 'number' },
            retiradas: { type: 'integer' },
          },
        },
      },
      os_id: uuid,
      total: { type: 'number' },
      itens: {
        type: 'array',
        items: {
          type: 'object',
          required: ['em', 'produto_nome', 'unidade_medida', 'quantidade', 'custo', 'total'],
          properties: {
            em: dt,
            produto_nome: str,
            unidade_medida: str,
            quantidade: { type: 'number' },
            custo: { type: 'number' },
            total: { type: 'number' },
            motivo: strNull,
            usuario_nome: strNull,
          },
        },
      },
    },
  },
  FormaPagamento: {
    type: 'string',
    enum: ['pix', 'dinheiro', 'credito', 'debito', 'boleto', 'transferencia'],
  },
  CategoriaFinanceira: {
    type: 'object',
    required: ['id', 'tipo', 'nome'],
    properties: {
      id: uuid,
      tipo: { type: 'string', enum: ['receita', 'despesa'] },
      nome: str,
      chave: strNull,
    },
  },
  Lancamento: {
    type: 'object',
    required: [
      'id',
      'tipo',
      'descricao',
      'valor',
      'valor_pago',
      'saldo',
      'vencimento',
      'situacao',
      'atrasado',
      'categoria',
      'criado_em',
    ],
    properties: {
      id: uuid,
      tipo: { type: 'string', enum: ['receita', 'despesa'] },
      descricao: str,
      valor: { type: 'number' },
      valor_pago: { type: 'number' },
      saldo: { type: 'number' },
      vencimento: { type: 'string', format: 'date' },
      pagamento: { type: 'string', format: 'date', nullable: true },
      forma: { allOf: [ref('FormaPagamento')], nullable: true },
      situacao: { type: 'string', enum: ['aberto', 'parcial', 'pago', 'cancelado'] },
      atrasado: { type: 'boolean' },
      parcela: { type: 'integer', nullable: true },
      parcelas: { type: 'integer', nullable: true },
      recorrencia: { type: 'string', enum: ['mensal'], nullable: true },
      motivo_cancelamento: strNull,
      criado_em: dt,
      categoria: {
        type: 'object',
        required: ['id', 'nome'],
        properties: { id: uuid, nome: str },
      },
      paciente: {
        type: 'object',
        nullable: true,
        required: ['id', 'nome'],
        properties: { id: uuid, nome: str },
      },
      cliente: {
        type: 'object',
        nullable: true,
        required: ['id', 'nome'],
        properties: { id: uuid, nome: str },
      },
      os: {
        type: 'object',
        nullable: true,
        required: ['id', 'numero'],
        properties: { id: uuid, numero: str },
      },
      baixas: {
        type: 'array',
        items: {
          type: 'object',
          required: ['id', 'valor', 'data', 'forma'],
          properties: {
            id: uuid,
            valor: { type: 'number' },
            data: { type: 'string', format: 'date' },
            forma: ref('FormaPagamento'),
            usuario_nome: strNull,
          },
        },
      },
    },
  },
  LancamentoEntrada: {
    type: 'object',
    properties: {
      tipo: { type: 'string', enum: ['receita', 'despesa'] },
      categoria_id: uuid,
      descricao: str,
      valor: { type: 'number' },
      vencimento: { type: 'string', format: 'date' },
      forma: { allOf: [ref('FormaPagamento')], nullable: true },
      paciente_id: { ...uuid, nullable: true },
      cliente_id: { ...uuid, nullable: true },
      parcelas: { type: 'integer' },
      recorrencia: { type: 'string', enum: ['mensal'], nullable: true },
      repeticoes: { type: 'integer' },
      baixa: {
        type: 'object',
        required: ['forma'],
        properties: { forma: ref('FormaPagamento'), data: { type: 'string', format: 'date' } },
      },
    },
  },
  ValoresFluxo: {
    type: 'object',
    required: ['realizado', 'em_aberto', 'previsto'],
    properties: {
      realizado: { type: 'number' },
      em_aberto: { type: 'number' },
      previsto: { type: 'number' },
    },
  },
  FluxoCaixa: {
    type: 'object',
    required: ['inicio', 'fim', 'receitas', 'despesas', 'saldo', 'semanas'],
    properties: {
      inicio: { type: 'string', format: 'date' },
      fim: { type: 'string', format: 'date' },
      receitas: ref('ValoresFluxo'),
      despesas: ref('ValoresFluxo'),
      saldo: {
        type: 'object',
        required: ['realizado', 'previsto'],
        properties: { realizado: { type: 'number' }, previsto: { type: 'number' } },
      },
      semanas: {
        type: 'array',
        items: {
          type: 'object',
          required: ['inicio', 'fim', 'receitas', 'despesas', 'a_receber', 'a_pagar'],
          properties: {
            inicio: { type: 'string', format: 'date' },
            fim: { type: 'string', format: 'date' },
            receitas: { type: 'number' },
            despesas: { type: 'number' },
            a_receber: { type: 'number' },
            a_pagar: { type: 'number' },
          },
        },
      },
    },
  },
  ContasEmAberto: {
    type: 'object',
    required: ['total', 'atrasado', 'itens'],
    properties: {
      total: { type: 'number' },
      atrasado: { type: 'number' },
      itens: { type: 'array', items: ref('Lancamento') },
      por_cliente: {
        type: 'array',
        items: {
          type: 'object',
          required: ['id', 'nome', 'tipo', 'faturado', 'recebido', 'a_receber'],
          properties: {
            id: uuid,
            nome: str,
            tipo: { type: 'string', enum: ['interno', 'externo'] },
            faturado: { type: 'number' },
            recebido: { type: 'number' },
            a_receber: { type: 'number' },
            vencimento: { type: 'string', format: 'date', nullable: true },
          },
        },
      },
    },
  },
  TotaisCaixa: {
    type: 'object',
    required: ['por_forma', 'entradas', 'saidas', 'saldo', 'movimentos'],
    properties: {
      por_forma: { type: 'object', additionalProperties: { type: 'number' } },
      entradas: { type: 'number' },
      saidas: { type: 'number' },
      saldo: { type: 'number' },
      movimentos: { type: 'integer' },
    },
  },
  Caixa: {
    type: 'object',
    required: ['data', 'situacao', 'totais'],
    properties: {
      id: { ...uuid, nullable: true },
      data: { type: 'string', format: 'date' },
      situacao: { type: 'string', enum: ['aberto', 'fechado'] },
      totais: ref('TotaisCaixa'),
      fechado_em: { ...dt, nullable: true },
      fechado_por: strNull,
      reaberto_em: { ...dt, nullable: true },
      reaberto_por: strNull,
      justificativa: strNull,
    },
  },
  Extrato: {
    type: 'object',
    required: [
      'cliente',
      'inicio',
      'fim',
      'os_concluidas',
      'total',
      'itens',
      'resumo',
      'pagamento',
    ],
    properties: {
      cliente: {
        type: 'object',
        required: ['id', 'tipo', 'razao_social'],
        properties: {
          id: uuid,
          tipo: { type: 'string', enum: ['interno', 'externo'] },
          razao_social: str,
          documento_tipo: strNull,
          documento: strNull,
          responsavel: strNull,
          cro: strNull,
          endereco: refNulo('Endereco'),
        },
      },
      inicio: { type: 'string', format: 'date' },
      fim: { type: 'string', format: 'date' },
      os_concluidas: { type: 'integer' },
      total: { type: 'number' },
      itens: {
        type: 'array',
        items: {
          type: 'object',
          required: ['id', 'numero', 'tipo_trabalho', 'elementos', 'data', 'paciente'],
          properties: {
            id: uuid,
            numero: str,
            tipo_trabalho: str,
            elementos: { type: 'array', items: { type: 'integer' } },
            valor: { type: 'number', nullable: true },
            data: { type: 'string', format: 'date' },
            paciente: str,
          },
        },
      },
      resumo: {
        type: 'array',
        items: {
          type: 'object',
          required: ['tipo_trabalho', 'quantidade', 'total'],
          properties: {
            tipo_trabalho: str,
            quantidade: { type: 'integer' },
            total: { type: 'number' },
          },
        },
      },
      pagamento: {
        type: 'object',
        required: ['recebido', 'a_receber'],
        properties: {
          recebido: { type: 'number' },
          a_receber: { type: 'number' },
          vencimento: { type: 'string', format: 'date', nullable: true },
        },
      },
    },
  },
};

const ok = (schema, codigo = '200') => ({
  [codigo]: { description: 'Sucesso', content: json(schema) },
});
const corpo = (schema) => ({ required: true, content: json(schema) });

const operacoes = {
  'post /auth/login': {
    requestBody: corpo({
      type: 'object',
      required: ['email', 'senha'],
      properties: { email: { type: 'string', format: 'email' }, senha: str },
    }),
    responses: ok(ref('LoginResposta')),
  },
  'post /auth/refresh': { responses: ok(ref('CsrfResposta')) },
  'get /auth/me': { responses: ok(ref('Me')) },
  'post /auth/esqueci-senha': {
    requestBody: corpo({
      type: 'object',
      required: ['email'],
      properties: { email: { type: 'string', format: 'email' } },
    }),
  },
  'post /auth/redefinir-senha': {
    requestBody: corpo({
      type: 'object',
      required: ['token', 'novaSenha'],
      properties: { token: str, novaSenha: str },
    }),
  },
  'get /usuarios': { responses: ok(pagina('Usuario')) },
  'post /usuarios': {
    requestBody: corpo({
      type: 'object',
      required: ['nome', 'email', 'perfil'],
      properties: { nome: str, email: str, perfil },
    }),
    responses: ok(ref('Usuario'), '201'),
  },
  'get /usuarios/{id}': { responses: ok(ref('Usuario')) },
  'patch /usuarios/{id}': {
    requestBody: corpo({ type: 'object', properties: { nome: str, email: str, perfil } }),
    responses: ok(ref('Usuario')),
  },
  'post /usuarios/{id}/bloquear': { responses: ok(ref('Usuario')) },
  'post /usuarios/{id}/desbloquear': { responses: ok(ref('Usuario')) },
  'get /perfis/{perfil}/permissoes': { responses: ok(ref('PermissoesPerfil')) },
  'put /perfis/{perfil}/permissoes': {
    requestBody: corpo({
      type: 'object',
      required: ['permissoes'],
      properties: { permissoes: { type: 'object', additionalProperties: { type: 'boolean' } } },
    }),
    responses: ok(ref('PermissoesPerfil')),
  },
  'get /auditoria': { responses: ok(pagina('AuditoriaItem')) },
  'get /notificacoes': { responses: ok(ref('NotificacoesPagina')) },
  'get /pacientes': { responses: ok(pagina('Paciente')) },
  'post /pacientes/buscar': {
    requestBody: corpo({
      type: 'object',
      required: ['busca'],
      properties: {
        busca: str,
        ativo: { type: 'string', enum: ['true', 'false', 'todos'] },
        filtro: { type: 'string', enum: ['consulta_hoje', 'sem_retorno', 'menores'] },
        pagina: { type: 'integer' },
        limite: { type: 'integer' },
      },
    }),
    responses: ok(pagina('Paciente')),
  },
  'post /pacientes': {
    requestBody: corpo(ref('PacienteEntrada')),
    responses: ok(ref('PacienteFicha'), '201'),
  },
  'get /pacientes/{id}': { responses: ok(ref('PacienteFicha')) },
  'patch /pacientes/{id}': {
    requestBody: corpo(ref('PacienteEntrada')),
    responses: ok(ref('PacienteFicha')),
  },
  'delete /pacientes/{id}': {
    responses: ok({
      type: 'object',
      required: ['acao'],
      properties: { acao: { type: 'string', enum: ['inativado', 'excluido'] } },
    }),
  },
  'get /pacientes/{id}/resumo': { responses: ok(ref('PacienteResumo')) },
  'get /pacientes/{id}/revelar/{campo}': { responses: ok(ref('CampoRevelado')) },
  'post /pacientes/{id}/consentimento': {
    requestBody: corpo({
      type: 'object',
      required: ['finalidade', 'forma'],
      properties: {
        finalidade: str,
        forma: { type: 'string', enum: ['presencial', 'digital', 'termo_assinado'] },
      },
    }),
    responses: ok(ref('Consentimento'), '201'),
  },
  'get /profissionais': { responses: ok({ type: 'array', items: ref('Profissional') }) },
  'post /profissionais': {
    requestBody: corpo({
      type: 'object',
      required: ['usuario_id', 'cro'],
      properties: { usuario_id: uuid, cro: str, especialidade: strNull, cor_agenda: strNull },
    }),
    responses: ok(ref('Profissional'), '201'),
  },
  'patch /profissionais/{id}': {
    requestBody: corpo({
      type: 'object',
      properties: { cro: str, especialidade: strNull, cor_agenda: str, ativo: { type: 'boolean' } },
    }),
    responses: ok(ref('Profissional')),
  },
  'get /profissionais/{id}/horarios': { responses: ok(ref('Horarios')) },
  'put /profissionais/{id}/horarios': {
    requestBody: corpo(ref('Horarios')),
    responses: ok(ref('Horarios')),
  },
  'get /consultas': { responses: ok({ type: 'array', items: ref('Consulta') }) },
  'post /consultas': {
    requestBody: corpo({
      type: 'object',
      required: ['paciente_id', 'profissional_id', 'inicio', 'fim'],
      properties: {
        paciente_id: uuid,
        profissional_id: uuid,
        cadeira: { type: 'integer' },
        inicio: dt,
        fim: dt,
        procedimento_previsto: strNull,
      },
    }),
    responses: ok(ref('Consulta'), '201'),
  },
  'get /consultas/{id}': { responses: ok(ref('Consulta')) },
  'patch /consultas/{id}': {
    requestBody: corpo({
      type: 'object',
      properties: {
        profissional_id: uuid,
        cadeira: { type: 'integer' },
        inicio: dt,
        fim: dt,
        procedimento_previsto: strNull,
      },
    }),
    responses: ok(ref('Consulta')),
  },
  'patch /consultas/{id}/status': {
    requestBody: corpo({
      type: 'object',
      required: ['status'],
      properties: {
        status: {
          type: 'string',
          enum: ['confirmada', 'chegou', 'concluida', 'faltou'],
        },
      },
    }),
    responses: ok(ref('Consulta')),
  },
  'post /consultas/{id}/cancelar': {
    requestBody: corpo({ type: 'object', required: ['motivo'], properties: { motivo: str } }),
    responses: ok(ref('Consulta')),
  },
  'get /consultas/{id}/lembrete-whatsapp': { responses: ok(ref('Lembrete')) },
  'get /bloqueios-agenda': { responses: ok({ type: 'array', items: ref('Bloqueio') }) },
  'post /bloqueios-agenda': {
    requestBody: corpo({
      type: 'object',
      required: ['inicio', 'fim', 'motivo'],
      properties: {
        profissional_id: { ...uuid, nullable: true },
        inicio: dt,
        fim: dt,
        motivo: str,
      },
    }),
    responses: ok(ref('Bloqueio'), '201'),
  },
  'get /agenda/disponibilidade': { responses: ok(ref('Disponibilidade')) },

  'get /pacientes/{id}/prontuario': { responses: ok(ref('Prontuario')) },
  'get /pacientes/{id}/anamneses': { responses: ok({ type: 'array', items: ref('AnamneseMeta') }) },
  'post /pacientes/{id}/anamneses': {
    requestBody: corpo({
      type: 'object',
      required: ['respostas'],
      properties: {
        respostas: { type: 'object', additionalProperties: true },
        alertas: { type: 'array', items: ref('Alerta') },
      },
    }),
    responses: ok(ref('Anamnese'), '201'),
  },
  'get /anamneses/{id}': { responses: ok(ref('Anamnese')) },
  'post /anamneses/{id}/assinatura': { responses: ok(ref('Anamnese')) },
  'get /pacientes/{id}/evolucoes': { responses: ok(pagina('Evolucao')) },
  'post /pacientes/{id}/evolucoes': {
    requestBody: corpo({
      type: 'object',
      required: ['conteudo'],
      properties: { conteudo: str, consulta_id: { ...uuid, nullable: true } },
    }),
    responses: ok(
      { type: 'object', required: ['id', 'criado_em'], properties: { id: uuid, criado_em: dt } },
      '201',
    ),
  },
  'post /evolucoes/{id}/adendos': {
    requestBody: corpo({ type: 'object', required: ['conteudo'], properties: { conteudo: str } }),
    responses: ok(
      { type: 'object', required: ['id', 'criado_em'], properties: { id: uuid, criado_em: dt } },
      '201',
    ),
  },
  'get /pacientes/{id}/acessos': { responses: ok(pagina('Acesso')) },
  'get /pacientes/{id}/prontuario/pdf': { responses: ok(ref('LinkDownload')) },
  'get /procedimentos': { responses: ok({ type: 'array', items: ref('ItemCatalogo') }) },
  'post /procedimentos': {
    requestBody: corpo({
      type: 'object',
      required: ['codigo', 'nome'],
      properties: {
        codigo: str,
        nome: str,
        especialidade: strNull,
        duracao_min: { type: 'integer' },
        valor_padrao: { type: 'number' },
      },
    }),
    responses: ok(ref('ItemCatalogo'), '201'),
  },
  'patch /procedimentos/{id}': {
    requestBody: corpo({
      type: 'object',
      properties: {
        codigo: str,
        nome: str,
        especialidade: strNull,
        duracao_min: { type: 'integer' },
        valor_padrao: { type: 'number' },
        ativo: { type: 'boolean' },
      },
    }),
    responses: ok(ref('ItemCatalogo')),
  },
  'get /pacientes/{id}/procedimentos': {
    responses: ok({ type: 'array', items: ref('ProcedimentoPaciente') }),
  },
  'post /pacientes/{id}/procedimentos': {
    requestBody: corpo({
      type: 'object',
      required: ['catalogo_id'],
      properties: {
        catalogo_id: uuid,
        dente: { type: 'integer', nullable: true },
        faces: { type: 'array', items: { type: 'string', enum: ['V', 'L', 'M', 'D', 'O', 'I'] } },
        status: { type: 'string', enum: ['planejado', 'em_andamento', 'concluido'] },
        data: { type: 'string', format: 'date', nullable: true },
        valor: { type: 'number', nullable: true },
        observacao: strNull,
      },
    }),
    responses: ok(ref('ProcedimentoPaciente'), '201'),
  },
  'patch /procedimentos-paciente/{id}': {
    requestBody: corpo({
      type: 'object',
      properties: {
        dente: { type: 'integer', nullable: true },
        faces: { type: 'array', items: { type: 'string', enum: ['V', 'L', 'M', 'D', 'O', 'I'] } },
        status: statusProcedimento,
        data: { type: 'string', format: 'date', nullable: true },
        valor: { type: 'number' },
        observacao: strNull,
        adendo: str,
      },
    }),
    responses: ok(ref('ProcedimentoPaciente')),
  },
  'get /pacientes/{id}/odontograma': { responses: ok(ref('Odontograma')) },
  'get /planos-tratamento': { responses: ok({ type: 'array', items: ref('PlanoTratamento') }) },
  'post /planos-tratamento': {
    requestBody: corpo({
      type: 'object',
      required: ['paciente_id', 'itens'],
      properties: {
        paciente_id: uuid,
        observacao: strNull,
        itens: {
          type: 'array',
          items: {
            type: 'object',
            required: ['catalogo_id'],
            properties: {
              catalogo_id: uuid,
              dente: { type: 'integer', nullable: true },
              faces: {
                type: 'array',
                items: { type: 'string', enum: ['V', 'L', 'M', 'D', 'O', 'I'] },
              },
              valor: { type: 'number', nullable: true },
            },
          },
        },
      },
    }),
    responses: ok(ref('PlanoTratamento'), '201'),
  },
  'get /planos-tratamento/{id}': { responses: ok(ref('PlanoTratamento')) },
  'post /planos-tratamento/{id}/aprovar': { responses: ok(ref('PlanoTratamento')) },
  'get /pacientes/{id}/anexos': { responses: ok({ type: 'array', items: ref('Anexo') }) },
  'post /pacientes/{id}/anexos': { responses: ok(ref('Anexo'), '201') },
  'get /anexos/{id}': { responses: ok({ allOf: [ref('Anexo'), ref('LinkDownload')] }) },

  'get /ordens-servico': { responses: ok({ type: 'array', items: ref('OrdemServico') }) },
  'post /ordens-servico': {
    requestBody: corpo(ref('OsEntrada')),
    responses: ok(ref('OrdemServico'), '201'),
  },
  'get /ordens-servico/atrasadas': {
    responses: ok({
      type: 'object',
      required: ['atrasadas', 'a_vencer'],
      properties: {
        atrasadas: { type: 'array', items: ref('OrdemServico') },
        a_vencer: { type: 'array', items: ref('OrdemServico') },
      },
    }),
  },
  'get /ordens-servico/tecnicos': {
    responses: ok({
      type: 'array',
      items: { type: 'object', required: ['id', 'nome'], properties: { id: uuid, nome: str } },
    }),
  },
  'get /ordens-servico/tipos-trabalho': { responses: ok({ type: 'array', items: str }) },
  'get /ordens-servico/{id}': { responses: ok(ref('OrdemServicoDetalhe')) },
  'patch /ordens-servico/{id}': {
    requestBody: corpo(ref('OsEntrada')),
    responses: ok(ref('OrdemServico')),
  },
  'patch /ordens-servico/{id}/etapa': {
    requestBody: corpo({
      type: 'object',
      required: ['etapa'],
      properties: {
        etapa: {
          type: 'string',
          enum: [...etapaProducao.enum, 'entregue'],
        },
        observacao: str,
      },
    }),
    responses: ok(ref('OrdemServico')),
  },
  'post /ordens-servico/{id}/cancelar': { responses: ok(ref('OrdemServico')) },
  'get /ordens-servico/{id}/historico': {
    responses: ok({ type: 'array', items: ref('OsHistorico') }),
  },
  'post /ordens-servico/{id}/tecnico': { responses: ok(ref('OrdemServico')) },
  'post /ordens-servico/{id}/provas': {
    requestBody: corpo({
      type: 'object',
      required: ['resultado'],
      properties: {
        resultado: { type: 'string', enum: ['aprovada', 'ajuste'] },
        motivo: str,
        etapa: etapaProducao,
      },
    }),
    responses: ok({
      type: 'object',
      required: ['os', 'provas'],
      properties: { os: ref('OrdemServico'), provas: { type: 'array', items: ref('OsProva') } },
    }),
  },
  'post /ordens-servico/{id}/refacoes': {
    requestBody: corpo({
      type: 'object',
      required: ['motivo'],
      properties: { motivo: str, etapa: etapaProducao },
    }),
    responses: ok({
      type: 'object',
      required: ['os', 'refacoes'],
      properties: {
        os: ref('OrdemServico'),
        refacoes: { type: 'array', items: ref('OsRefacao') },
      },
    }),
  },
  'get /ordens-servico/{id}/anexos': { responses: ok({ type: 'array', items: ref('OsAnexo') }) },
  'post /ordens-servico/{id}/anexos': { responses: ok(ref('OsAnexo'), '201') },
  'get /ordens-servico/{id}/anexos/{anexoId}': {
    responses: ok({ allOf: [ref('OsAnexo'), ref('LinkDownload')] }),
  },
  'get /laboratorio/clientes': { responses: ok({ type: 'array', items: ref('LabCliente') }) },
  'post /laboratorio/clientes': {
    requestBody: corpo(ref('LabClienteEntrada')),
    responses: ok(ref('LabCliente'), '201'),
  },
  'get /laboratorio/clientes/{id}': { responses: ok(ref('LabCaderno')) },
  'patch /laboratorio/clientes/{id}': {
    requestBody: corpo(ref('LabClienteEntrada')),
    responses: ok(ref('LabCliente')),
  },
  'get /laboratorio/clientes/{id}/revelar/{campo}': { responses: ok(ref('CampoRevelado')) },
  'get /laboratorio/tabela-precos': { responses: ok({ type: 'array', items: ref('Preco') }) },
  'put /laboratorio/tabela-precos': {
    requestBody: corpo({
      type: 'object',
      required: ['itens'],
      properties: {
        itens: {
          type: 'array',
          items: {
            type: 'object',
            required: ['tipo_trabalho', 'valor'],
            properties: {
              tipo_trabalho: str,
              cliente_id: { ...uuid, nullable: true },
              valor: { type: 'number' },
              vigencia_inicio: { type: 'string', format: 'date' },
            },
          },
        },
      },
    }),
    responses: ok({ type: 'array', items: ref('Preco') }),
  },
  'get /estoque/produtos': { responses: ok({ type: 'array', items: ref('Produto') }) },
  'post /estoque/produtos': {
    requestBody: corpo(ref('ProdutoEntrada')),
    responses: ok(ref('Produto'), '201'),
  },
  'patch /estoque/produtos/{id}': {
    requestBody: corpo(ref('ProdutoEntrada')),
    responses: ok(ref('Produto')),
  },
  'post /estoque/entradas': {
    requestBody: corpo({
      type: 'object',
      required: ['produto_id', 'quantidade', 'custo_unitario'],
      properties: {
        produto_id: uuid,
        quantidade: { type: 'number' },
        lote: strNull,
        validade: { type: 'string', format: 'date', nullable: true },
        custo_unitario: { type: 'number' },
        fornecedor: strNull,
        nota_fiscal: strNull,
        lancar_financeiro: { type: 'boolean' },
      },
    }),
    responses: ok(ref('Produto'), '201'),
  },
  'post /estoque/retiradas': {
    requestBody: corpo({
      type: 'object',
      required: ['produto_id', 'quantidade', 'motivo'],
      properties: {
        produto_id: uuid,
        lote_id: { ...uuid, nullable: true },
        quantidade: { type: 'number' },
        os_id: { ...uuid, nullable: true },
        motivo: { type: 'string', enum: ['producao', 'uso', 'perda', 'refacao', 'vencimento'] },
        observacao: strNull,
      },
    }),
    responses: ok(ref('Produto'), '201'),
  },
  'post /estoque/ajustes': {
    requestBody: corpo({
      type: 'object',
      required: ['produto_id', 'lote_id', 'saldo_contado', 'justificativa'],
      properties: {
        produto_id: uuid,
        lote_id: uuid,
        saldo_contado: { type: 'number' },
        justificativa: str,
      },
    }),
    responses: ok(ref('Produto'), '201'),
  },
  'get /estoque/movimentacoes': {
    responses: ok({ type: 'array', items: ref('Movimentacao') }),
  },
  'get /estoque/alertas': {
    responses: ok({
      type: 'object',
      required: ['abaixo_minimo', 'vencendo'],
      properties: {
        abaixo_minimo: { type: 'array', items: ref('Produto') },
        vencendo: { type: 'array', items: ref('Produto') },
      },
    }),
  },
  'get /estoque/resumo': { responses: ok(ref('EstoqueResumo')) },
  'get /estoque/custo-por-os': { responses: ok(ref('CustoPorOs')) },
  'get /financeiro/categorias': {
    responses: ok({ type: 'array', items: ref('CategoriaFinanceira') }),
  },
  'post /financeiro/categorias': {
    requestBody: corpo({
      type: 'object',
      required: ['tipo', 'nome'],
      properties: { tipo: { type: 'string', enum: ['receita', 'despesa'] }, nome: str },
    }),
    responses: ok(ref('CategoriaFinanceira'), '201'),
  },
  'get /financeiro/fluxo-caixa': { responses: ok(ref('FluxoCaixa')) },
  'get /financeiro/lancamentos': { responses: ok({ type: 'array', items: ref('Lancamento') }) },
  'post /financeiro/lancamentos': {
    requestBody: corpo(ref('LancamentoEntrada')),
    responses: ok({ type: 'array', items: ref('Lancamento') }, '201'),
  },
  'get /financeiro/lancamentos/{id}': { responses: ok(ref('Lancamento')) },
  'patch /financeiro/lancamentos/{id}': {
    requestBody: corpo(ref('LancamentoEntrada')),
    responses: ok(ref('Lancamento')),
  },
  'post /financeiro/lancamentos/{id}/baixa': {
    requestBody: corpo({
      type: 'object',
      required: ['forma'],
      properties: {
        valor: { type: 'number' },
        forma: ref('FormaPagamento'),
        data: { type: 'string', format: 'date' },
      },
    }),
    responses: ok(ref('Lancamento')),
  },
  'post /financeiro/lancamentos/{id}/cancelar': { responses: ok(ref('Lancamento')) },
  'get /financeiro/contas-receber': { responses: ok(ref('ContasEmAberto')) },
  'get /financeiro/contas-pagar': { responses: ok(ref('ContasEmAberto')) },
  'get /financeiro/caixa/hoje': { responses: ok(ref('Caixa')) },
  'get /financeiro/caixa/fechamentos': {
    responses: ok({
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'data', 'totais', 'situacao', 'fechado_em'],
        properties: {
          id: uuid,
          data: { type: 'string', format: 'date' },
          totais: ref('TotaisCaixa'),
          situacao: { type: 'string', enum: ['aberto', 'fechado'] },
          fechado_em: dt,
          fechado_por: strNull,
          reaberto_em: { ...dt, nullable: true },
          reaberto_por: strNull,
          justificativa: strNull,
        },
      },
    }),
  },
  'post /financeiro/caixa/fechar': {
    requestBody: {
      content: json({
        type: 'object',
        properties: { data: { type: 'string', format: 'date' } },
      }),
    },
    responses: ok(ref('Caixa')),
  },
  'post /financeiro/caixa/{id}/reabrir': { responses: ok(ref('Caixa')) },
  'get /financeiro/extratos/{clienteId}': { responses: ok(ref('Extrato')) },
  'post /financeiro/extratos/{clienteId}/pdf': {
    requestBody: { content: json({ type: 'object', properties: { mes: str } }) },
    responses: ok(ref('LinkDownload')),
  },
  'post /financeiro/recibos/{lancamentoId}': { responses: ok(ref('LinkDownload')) },
};

/** Aplica o contrato sobre o spec gerado pelas anotações @swagger. */
function aplicarContrato(spec) {
  spec.components = spec.components || {};
  spec.components.schemas = { ...(spec.components.schemas || {}), ...schemas };
  for (const [chave, op] of Object.entries(operacoes)) {
    const [metodo, caminho] = chave.split(' ');
    const alvo = spec.paths?.[caminho]?.[metodo];
    if (!alvo) throw new Error(`Contrato aponta para operação inexistente: ${chave}`);
    if (op.requestBody) alvo.requestBody = op.requestBody;
    alvo.responses = { ...(alvo.responses || {}) };
    for (const [codigo, resp] of Object.entries(op.responses || {})) {
      alvo.responses[codigo] = { ...(alvo.responses[codigo] || {}), ...resp };
    }
  }
  for (const caminho of Object.values(spec.paths)) {
    for (const op of Object.values(caminho)) {
      for (const [codigo, resp] of Object.entries(op.responses || {})) {
        if (Number(codigo) >= 400 && !resp.content) resp.content = json(ref('Erro'));
      }
    }
  }
  return spec;
}

module.exports = { aplicarContrato };
