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
        properties: { id: uuid, codigo: str, nome: str },
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
      os_em_aberto: { type: 'array', items: { type: 'object', additionalProperties: true } },
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
          enum: ['confirmada', 'chegou', 'em_atendimento', 'concluida', 'faltou'],
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
