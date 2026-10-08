# QuickOdonto — Checklist de Desenvolvimento

> Documento de execução derivado da [URS](URS_QuickOdonto.docx) (QO-URS-001 v1.1) e do protótipo visual (29 telas).
> Stack definida pela skill `scalable-api-foundation`.
> Convenção de status: `[ ]` não iniciado · `[~]` em andamento (só um por vez) · `[x]` concluído **com prova** (fluxo real executado no Swagger/tela, log conferido).

---

## 0. Stack e decisões

| Camada | Escolha | Por quê |
|---|---|---|
| Backend | **Node.js + Express** (JavaScript) | Fundação da skill: API + Postgres + JWT sem framework opinativo; CRUD pesado com poucas centenas de usuários simultâneos é exatamente o caso de uso dela. |
| Banco | **PostgreSQL 16** (Docker) | Relacional, transacional — prontuário, OS e financeiro exigem integridade referencial. |
| Auth | **JWT + bcrypt** (manual) | Controle total dos perfis e do escopo por unidade (clínica/laboratório). |
| Docs da API | **Swagger (OpenAPI)** em `/api-docs` | Contrato entre backend, front web e, na fase 2, o app nativo. |
| Frontend web | **React + TypeScript + Vite** | Tipos derivados do contrato OpenAPI; o sistema tem muitas entidades e o compilador evita erros bobos entre telas. |
| Mobile (fase 1) | **PWA responsivo** — mesmo app React | Um código só; cobre as 8 telas mobile do protótipo sem loja de aplicativos. |
| Mobile (fase 2) | **React Native + Expo** | Só depois do PWA em uso; a fase 1 já deixa a API preparada (ver seção 8). |
| Infra | **Docker + Docker Compose** (dev) · **VPS + Nginx** (produção) | Deploy previsível e backup simples do Postgres. |
| Estrutura | **Monolito modular** (`src/modules/<domínio>/`) | Cada módulo já nasce com fronteira clara; microsserviço só se houver motivo real. |

**Adiado de propósito (não fazer agora):** Redis, CDN, load balancer, Prometheus/Grafana, fila de jobs. Entram quando existir o problema que resolvem.

**Princípios de segurança — valem para todo item deste checklist:**

1. **Todo dado sensível é criptografado em trânsito (TLS) e em repouso (disco, anexos e backups).** Além disso, os dados de maior risco — texto clínico, documentos e arquivos — são criptografados campo a campo, conforme a classificação da seção 3.1. Dado sensível aqui é: dado de saúde (anamnese, evolução, procedimento, anexo clínico), documento (CPF, CNPJ, RG, CRO), contato pessoal, dado financeiro e credencial.
2. **O frontend não persiste dado sensível nem carrega segredo.** A API devolve só o que a tela exibe; nada de token, chave ou campo extra no bundle, no `localStorage` ou no cache do navegador. O dado que a tela mostra existe na memória do navegador enquanto a tela está aberta — o que não pode é sobrar depois.
3. **Autenticação, autorização e decisão de rota são do backend.** O front esconde o que o perfil não usa por conveniência visual; quem autoriza é sempre o servidor, negando por padrão.

**Arquivos vivos do projeto (criar na raiz, antes de codar):**

- [x] `tasks/todo.md` — plano da tarefa atual
- [x] `tasks/lessons.md` — regras aprendidas com erros (reler no início de cada sessão)

---

## 1. Fase 0 — Fundação

- [x] Repositório Git criado, `.gitignore` com `.env`, `node_modules`, `dist`
- [ ] Branch `main` protegida no GitHub — ação administrativa em sistema remoto; configurar em Settings → Branches e confirmar (fica para o usuário)
- [x] `docker-compose.yml`: serviços `api`, `db` (postgres:16-alpine), `web`
- [x] `Dockerfile` da API e do front
- [x] `.env` e `.env.example` (`DB_*`, `JWT_SECRET`, `JWT_EXPIRES`, `APP_URL`, `SMTP_*`) — segredos nunca no código
- [x] `src/config/db.js` com pool de conexão e queries sempre parametrizadas (`$1, $2`)
- [x] `src/index.js` — bootstrap Express (helmet, cors, json, rotas, errorHandler)
- [x] `src/swagger.js` — OpenAPI agregando `./src/modules/**/*.routes.js`
- [x] `src/middleware/errorHandler.js` — loga interno, responde genérico (sem stack trace ao cliente)
- [x] `GET /health` respondendo e Swagger UI abrindo em `/api-docs` — provado via `docker compose up` + `curl` (200 nos dois) e inspeção do spec do Swagger
- [x] ESLint + Prettier + EditorConfig nos dois projetos — `npx eslint` e `npx prettier --check` limpos em `src/` e `web/src/`
- [x] Estrutura de pastas do monolito modular criada (`modules/`, `middleware/`, `config/`)

---

## 2. Backend — Banco de dados

### 2.1 Tabelas

Toda tabela com `id` (uuid), `criado_em`, `atualizado_em`; onde indicado, `unidade` (`clinica` | `laboratorio`) para separar os dados (RNF-010).

**Acesso e pessoas**
- [x] `usuarios` (nome, email único, senha_hash, perfil, unidade, status, ultimo_acesso, dois_fatores) — migration `20261007000001_acesso` aplicada (`\dt` conferido); inclui `tentativas_falhas`/`bloqueado_ate` para o bloqueio de login
- [x] `perfis_permissoes` (perfil, chave, habilitado) — alimenta a tela de permissões do laboratório (RF-ADL-032) — migration aplicada; seed com as 3 permissões do laboratório; lida em `/auth/me`
- [x] `profissionais` (usuario_id, cro, especialidade, cor_agenda) — migration aplicada; criação restrita a usuário da clínica com perfil Clínica; CRO em claro (registro público — decisão registrada)
- [x] `profissional_horarios` (dia_semana, inicio, fim) — migration aplicada com CHECK de janela válida; `PUT /profissionais/:id/horarios` recusa sobreposição
- [x] `pacientes` (nº prontuário sequencial, nome, cpf único, nascimento, sexo, celular, email, endereço, responsável, origem, observações, ativo) — migration aplicada; nº por sequence; CPF cifrado + `cpf_hash` único; `observacoes` cifradas; CHECK de banco: sem CPF exige responsável; provado no banco (`cpf_cifrado` = `v1:…`)
- [x] `consentimentos_lgpd` (paciente_id, finalidade, data, forma) — migration aplicada; `POST /pacientes/:id/consentimento` testado

**Agenda**
- [x] `consultas` (paciente_id, profissional_id, cadeira, inicio, fim, procedimento_previsto, status, motivo_cancelamento) — migration aplicada; RN-002 e RN-010 garantidas por EXCLUDE (btree_gist) no banco, não só na aplicação
- [x] `consulta_historico` (consulta_id, de_status, para_status, usuario_id, em) — migration aplicada; toda criação, mudança de status, cancelamento e reagendamento grava usuário e hora
- [x] `bloqueios_agenda` (profissional_id, inicio, fim, motivo) — migration aplicada; `profissional_id` nulo = clínica toda; recusa bloqueio sobre consulta existente

**Prontuário clínico**
- [ ] `anamneses` (paciente_id, versao, respostas jsonb, alertas jsonb, profissional_id, assinada_em) — versão nova nunca sobrescreve a anterior (RF-CLI-003)
- [ ] `evolucoes` (paciente_id, conteudo, profissional_id) — sem DELETE
- [ ] `adendos` (evolucao_id, conteudo, profissional_id)
- [ ] `anexos` (paciente_id | os_id, tipo, nome, mime, tamanho, caminho)
- [ ] `acessos_prontuario` (paciente_id, usuario_id, em) — RF-CLI-015
- [ ] `procedimentos_catalogo` (codigo, nome, especialidade, duracao_min, valor_padrao, ativo)
- [ ] `procedimentos_paciente` (paciente_id, catalogo_id, dente, faces, status, profissional_id, data, valor)
- [ ] `planos_tratamento` + `plano_itens` (orçamento aprovado gera contas a receber)

**Ordens de serviço**
- [ ] `ordens_servico` (numero, origem `propria|externa`, cliente_id, paciente_id ou nome, dentista, tipo_trabalho, elementos, cor, material, enviado_em, previsao_entrega, valor, etapa, tecnico_id, status, motivo_cancelamento)
- [ ] `os_historico` (os_id, de_etapa, para_etapa, usuario_id, em, observacao)
- [ ] `os_provas` e `os_refacoes` (os_id, numero, motivo, data)
- [ ] `laboratorio_clientes` (tipo interno/externo, razão social, cnpj_cpf, responsável, cro, contatos, endereço, condição de pagamento, ativo)
- [ ] `tabela_precos` (tipo_trabalho, cliente_id nulo = padrão, valor, vigência)

**Estoque (por unidade)**
- [ ] `produtos` (unidade, nome, codigo, categoria, unidade_medida, estoque_minimo, fornecedor, custo_medio)
- [ ] `lotes` (produto_id, lote, validade, saldo)
- [ ] `estoque_movimentacoes` (produto_id, lote_id, tipo `entrada|retirada|ajuste`, quantidade, custo, os_id, motivo, usuario_id, justificativa)

**Financeiro (por unidade)**
- [ ] `categorias_financeiras`
- [ ] `lancamentos` (unidade, tipo, categoria_id, descricao, valor, vencimento, pagamento, forma, paciente_id, cliente_id, os_id, parcela, recorrencia, situacao)
- [ ] `caixas_diarios` (unidade, data, totais por forma, fechado_em, fechado_por, reaberto_por, justificativa)

**Transversais**
- [x] `notificacoes` (usuario_id, tipo, titulo, link, lida_em) — migration aplicada; `GET /notificacoes` e `PATCH /:id/lida` testados (isolamento por usuário); helper `notificar()` para os demais módulos
- [x] `auditoria_logs` (usuario_id, entidade, entidade_id, acao, antes jsonb, depois jsonb, ip, em) — somente inserção — migration aplicada; trigger bloqueia UPDATE/DELETE (provado em teste); só o `ON DELETE SET NULL` do usuário é permitido

### 2.2 Estrutura e dados

- [ ] Índices: `pacientes(nome)`, `pacientes(cpf)`, `consultas(profissional_id, inicio)`, `ordens_servico(etapa, previsao_entrega)`, `lancamentos(unidade, vencimento)`, `auditoria_logs(entidade, entidade_id)` — feitos `pacientes(nome)`, `pacientes(cpf_hash)` único e `consultas(profissional_id, inicio)`; `auditoria_logs(entidade, entidade_id)` também já existe; faltam os de OS e lançamentos (M3/M6)
- [ ] Constraint de unicidade: CPF do paciente, e-mail do usuário, número da OS — a unicidade do CPF usa a coluna de hash (3.1), não o valor em claro — CPF do paciente (via `cpf_hash`) e e-mail do usuário prontos; falta número da OS (M3)
- [ ] Marcar no schema quais colunas são criptografadas e quais são hash de busca, para ninguém criar índice ou relatório sobre o valor em claro — `COMMENT ON COLUMN` nas colunas cifradas/hash (migration `…0002_comentarios_classificacao`); vale manter para toda tabela nova
- [ ] `init.sql` do bootstrap → migrar para **migrations** (Knex ou Prisma) antes do primeiro deploy
- [ ] Seed de desenvolvimento: 2 profissionais, 8 pacientes, 4 clientes de laboratório, catálogo de procedimentos, produtos de estoque — `seeds/02_clinica_dev.js` cria 2 profissionais com jornada e 8 pacientes (CPF cifrado); faltam clientes de laboratório, catálogo e produtos (M3/M4/M5)
- [ ] Backup: `pg_dump` agendado (diário, retenção 30 dias) + teste de restauração

---

## 3. Backend — Autenticação, permissões e segurança

- [x] `POST /auth/login` com bcrypt (custo 10+) e JWT — `curl` real: 200 com cookies HttpOnly; senha errada e e-mail inexistente respondem igual; 11 testes jest verdes
- [x] Refresh token (rotativo, armazenado em tabela, revogável) — tabela `sessoes` guarda só o hash SHA-256; teste: token antigo recusado e reuso derruba as sessões do usuário
- [x] `authMiddleware` — valida JWT e injeta `req.usuario` — testado: sem cookie 401, com cookie 200; consulta o banco, então bloqueio vale na hora
- [x] `permitirPerfis([...])` — autorização por perfil — testado: perfil fora da lista 403, na lista 200, lista vazia nega todos (a matriz da URS será aplicada rota a rota nos próximos módulos)
- [x] `escopoUnidade` — usuário do laboratório nunca lê dados financeiros/estoque da clínica e vice-versa (RN-008) — testado: clínica barrada em rota do laboratório (403), laboratório passa
- [ ] Permissões configuráveis do perfil Laboratório (entrada de estoque, criar OS externa, cancelar OS) — configuração pronta e testada (`GET/PUT /perfis/laboratorio/permissoes`, refletida em `/auth/me`); falta aplicar nas rotas de estoque (M5) e OS (M3)
- [x] Recuperação de senha por e-mail (token com validade curta, uso único) — `/auth/esqueci-senha` responde 204 igual exista ou não o e-mail; token de 30 min, uso único, só o hash no banco; redefinir derruba as sessões. Convite chegou no Mailpit (`localhost:8025`). Obs.: o token vai na URL do e-mail — exceção inevitável do link, mitigada por uso único e validade curta
- [x] Bloqueio após 5 tentativas inválidas + `express-rate-limit` em `/auth/*` (RNF-002) — bloqueio 423 (15 min) provado em teste; 429 provado em teste (`ratelimit.test.js`) e via `curl` (30 req/15 min por IP, compartilhado entre login/refresh/esqueci/redefinir)
- [x] Sessão expira em 30 min de inatividade — teste: `ultimo_uso` retroagido 31 min → refresh recusado (access token dura 15 min)
- [ ] 2FA para perfis administradores (TOTP) — *Desejável*
- [x] Middleware de auditoria gravando antes/depois em toda escrita (RF-GER-009) — `middleware/auditoria.js`: o handler preenche `res.locals.auditoria` e a trilha grava no `finish` só em sucesso; remove campos senha/token/hash; aplicado em `/usuarios` e `/perfis`. Todo módulo novo de escrita deve usar
- [ ] Registro de acesso ao prontuário em toda leitura (RF-CLI-015)
- [ ] Upload de anexos: validação de mime/tamanho (50 MB), nomes sanitizados, fora do diretório público
- [x] Testes dos dois caminhos de cada middleware: **permitido** e **bloqueado** (obrigatório para marcar `[x]`) — `auth`, `permitirPerfis`, `escopoUnidade`, `csrf`, rate limit e auditoria testados nos caminhos permitido e bloqueado (31 testes verdes)

### 3.1 Criptografia de dados sensíveis

**Por que não criptografar tudo campo a campo:** campo cifrado não pode ser buscado, ordenado nem somado, e a chave vira ponto único de falha — perder a chave é perder o prontuário, que tem guarda obrigatória de 20 anos. A criptografia de campo protege, na prática, contra **dump de banco e backup roubados**; contra invasão do servidor quem protege é controle de acesso e auditoria. Por isso o tratamento é por tipo de dado.

#### Classificação dos dados

| Dado | Tratamento |
|---|---|
| Senhas | Hash com bcrypt (custo 10+) ou Argon2 — nunca criptografia reversível |
| Anexos clínicos: radiografia, foto, documento digitalizado | Arquivo **cifrado** no armazenamento + entrega por URL assinada de curta duração e uso único |
| Texto clínico livre: respostas de anamnese, alertas, evoluções, adendos, observações de procedimento | **Cifrado por campo** (AES-256-GCM na aplicação ou `pgcrypto`) — é o dado mais sensível e nunca entra em filtro ou ordenação |
| Documentos: CPF, RG, CNPJ | **Cifrado por campo** + coluna de hash determinístico (HMAC com chave própria) para busca e checagem de duplicidade |
| Nome, telefone, e-mail, nascimento, endereço, nº de prontuário | **Em claro**, protegidos por controle de acesso, registro de acesso e mascaramento na tela — são a base da busca do dia a dia |
| Valores, datas, status, estoque, lançamentos | **Em claro** — entram em filtro, soma e relatório o tempo todo |

#### Decisões de classificação registradas (M2)

- `pacientes.observacoes` é texto livre e pode receber informação clínica → **cifrado**, sem busca.
- `profissionais.cro` é registro público do conselho → **em claro**.
- E-mail de paciente e de usuário → **em claro** (tabela acima); unicidade do usuário por índice único.
- Exportações (`GET /pacientes/exportar`) saem **mascaradas** e auditadas, entregues direto na resposta autenticada; a entrega por URL assinada fica para o item de anexos/PDF (M4).

#### Itens

- [ ] TLS 1.2+ obrigatório; HSTS ligado; redirecionamento de HTTP para HTTPS
- [ ] Disco/volume do banco com criptografia em repouso
- [ ] Backups criptografados, com a chave guardada **separada** do backup
- [ ] Criptografia por campo aplicada exatamente às colunas da tabela acima — nada além disso sem decisão registrada — `lib/crypto.js` (AES-256-GCM, formato `v1:` para rotação) aplicado a `cpf` e `observacoes` de pacientes; RG/CNPJ entram com os clientes do laboratório (M3) e texto clínico no M4
- [x] Coluna de hash (HMAC) para CPF e e-mail, usada em busca e unicidade — CPF: `cpf_hash` (HMAC-SHA256, `HMAC_KEY` própria) usado na busca exata e na unicidade, testado. E-mail: decisão registrada — fica em claro (tabela 3.1) e a unicidade do usuário é por índice único, então não há hash de e-mail
- [x] Chave de criptografia fora do banco e fora do repositório (variável de ambiente com permissão restrita ou KMS) — `ENC_KEY`/`HMAC_KEY` só no `.env` (ignorado pelo git, confirmado com `git check-ignore`); `.env.example` sem valores. Em produção virar variável com permissão restrita ou KMS
- [ ] **Custódia da chave:** cópia em cofre de senhas da clínica **e** cópia offline guardada fisicamente; procedimento escrito de quem tem acesso
- [ ] Rotação de chave documentada, com script de recriptografia testado antes de precisar dele
- [x] Mascaramento na tela por padrão (CPF, telefone, documentos); revelar o valor completo exige permissão e fica na auditoria — API devolve CPF e celulares mascarados (`***.***.***-25`, `(11) *****-4321`); `GET /pacientes/:id/revelar/:campo` exige perfil e grava `revelar_cpf` etc. na auditoria — provado em teste, sem o valor na trilha. Falta o lado do front (M2 web)
- [x] Logs, auditoria e mensagens de erro nunca gravam senha, token, dado clínico ou documento completo — auditoria higieniza e usa a versão mascarada do paciente; testes conferem que CPF e celular completos não aparecem na trilha; logs da API conferidos sem CPF
- [ ] **Teste trimestral de restauração:** restaurar o backup num ambiente limpo e abrir um prontuário cifrado, provando que backup e chave funcionam juntos
- [ ] Dado em claro é compensado por acesso restrito: perfil, registro de quem abriu cada prontuário e revisão periódica de quem tem acesso

### 3.2 Fronteira entre backend e frontend

- [x] Sessão por **cookie httpOnly + Secure + SameSite=Strict** (`Secure` ligado quando `NODE_ENV=production`; em dev HTTP fica desligado) — nenhum token em `localStorage`, `sessionStorage` ou IndexedDB
- [ ] Backend preparado para dois modos de sessão desde o início: cookie para web e PWA, token de sessão longa (Keychain/Keystore) para o app nativo da fase 2 — mesma tabela de sessões, mesma revogação
- [x] Refresh token rotativo também só em cookie httpOnly; o front nunca lê, guarda nem envia token manualmente — o front só usa o cookie; a renovação transparente é do `client.ts` e não toca em token (testado)
- [x] Proteção CSRF (token por sessão ou double submit) em toda rota de escrita — token = HMAC do access token, enviado no header `X-CSRF-Token` (devolvido em login/refresh/me); `curl` real: POST sem token 403, com token 201. Requisições `Bearer` (app nativo) são isentas
- [ ] Respostas enxutas: a API devolve apenas os campos que a tela usa, já mascarados quando for o caso — nada de objeto inteiro do banco
- [ ] Autorização verificada no servidor em **toda** rota (negar por padrão); chamar a rota direto, fora da tela, retorna 403
- [x] Nenhum segredo, chave de terceiros ou credencial no bundle do front (nem em variáveis `VITE_*`): só a URL da API e flags públicas — bundle de produção inspecionado (0 ocorrências)
- [ ] O front nunca fala direto com banco, storage ou serviço de terceiros com credencial — tudo passa pelo backend
- [ ] Nada sensível em URL, query string ou fragmento; `Cache-Control: no-store` nas respostas com dado clínico ou financeiro — `no-store` já está em pacientes, consultas e `/auth/me`; PENDENTE: a busca de paciente manda o termo (que pode ser um CPF completo) em `GET /pacientes?busca=`, que pode ficar em log de acesso/proxy. Trocar por `POST /pacientes/buscar` antes do deploy
- [ ] PDFs, recibos e exportações gerados no backend e entregues por URL assinada — o front não monta documento com dado sensível
- [x] Logout e expiração de sessão limpam o estado em memória do front e invalidam a sessão no servidor — provado: após sair, `/auth/me` = 401 e o cache de consultas é descartado; expiração dispara o mesmo caminho e avisa na tela de login

---

## 4. Backend — Rotas da API

Base: `/api/v1`. Toda rota nasce com anotação `@swagger` no mesmo commit.
Perfis: **S** Secretaria · **C** Clínica · **AC** Adm. Clínica · **L** Laboratório · **AL** Adm. Laboratório.

### 4.1 Autenticação e usuários — `modules/auth`, `modules/usuarios`

| Método | Rota | Descrição | Perfis |
|---|---|---|---|
| POST | `/auth/login` | Autentica e devolve tokens | público |
| POST | `/auth/refresh` | Renova o token | autenticado |
| POST | `/auth/logout` | Revoga o refresh token | autenticado |
| GET | `/auth/me` | Usuário logado + permissões | autenticado |
| POST | `/auth/esqueci-senha` | Envia link de redefinição | público |
| POST | `/auth/redefinir-senha` | Redefine com token | público |
| GET | `/usuarios` | Lista usuários da unidade | AC, AL |
| POST | `/usuarios` | Cria usuário e envia convite | AC, AL |
| GET/PATCH | `/usuarios/:id` | Detalha / edita | AC, AL |
| POST | `/usuarios/:id/bloquear` \| `/desbloquear` | Muda status | AC, AL |
| POST | `/usuarios/:id/redefinir-senha` | Dispara redefinição | AC, AL |
| GET/PUT | `/perfis/:perfil/permissoes` | Permissões do perfil (tela do laboratório) | AC, AL |
| GET | `/auditoria` | Trilha filtrável por entidade, usuário e período | AC, AL |
| GET | `/notificacoes` · PATCH `/notificacoes/:id/lida` | Notificações internas | autenticado |

### 4.2 Pacientes — `modules/pacientes`

| Método | Rota | Descrição | Perfis |
|---|---|---|---|
| GET | `/pacientes?busca=&ativo=&pagina=` | Lista com busca por nome, CPF ou celular | S, C |
| POST | `/pacientes` | Cadastra (gera nº de prontuário) | S |
| GET | `/pacientes/:id` | Ficha completa | S, C |
| PATCH | `/pacientes/:id` | Edita | S |
| DELETE | `/pacientes/:id` | Inativa (exclusão física só sem histórico — RN-009) | S |
| GET | `/pacientes/:id/resumo` | Próximas consultas e OS em aberto | S, C |
| POST | `/pacientes/:id/consentimento` | Registra consentimento LGPD | S |
| GET | `/pacientes/exportar?formato=xlsx` | Exportação | S |

### 4.3 Agenda e consultas — `modules/agenda`

| Método | Rota | Descrição | Perfis |
|---|---|---|---|
| GET | `/consultas?inicio=&fim=&profissional=&status=` | Agenda (dia/semana/mês e quadro) | S, C |
| POST | `/consultas` | Agenda consulta (valida conflito — RN-002) | S |
| GET/PATCH | `/consultas/:id` | Detalha / reagenda | S |
| PATCH | `/consultas/:id/status` | Move no quadro (grava histórico) | S |
| POST | `/consultas/:id/cancelar` | Cancela com motivo e libera horário (RN-010) | S |
| GET | `/consultas/:id/lembrete-whatsapp` | Devolve link `wa.me` com mensagem pronta | S |
| GET | `/agenda/disponibilidade?profissional=&data=` | Horários livres | S |
| GET/POST/DELETE | `/bloqueios-agenda` | Feriados, intervalos e bloqueios | S, AC |
| GET/POST/PATCH | `/profissionais` · `/profissionais/:id/horarios` | Cadastro e jornada | AC |

### 4.4 Prontuário, anamnese e procedimentos — `modules/prontuario`

| Método | Rota | Descrição | Perfis |
|---|---|---|---|
| GET | `/pacientes/:id/prontuario` | Resumo, alertas e linha do tempo | C |
| GET | `/pacientes/:id/anamneses` | Lista de versões | C |
| POST | `/pacientes/:id/anamneses` | Cria **nova versão** (nunca sobrescreve) | C |
| GET | `/anamneses/:id` · POST `/anamneses/:id/assinatura` | Detalhe e assinatura | C |
| GET/POST | `/pacientes/:id/evolucoes` | Evoluções clínicas (sem DELETE) | C |
| POST | `/evolucoes/:id/adendos` | Correção por adendo (RN-006) | C |
| GET/POST | `/pacientes/:id/anexos` · GET `/anexos/:id` | Radiografias, fotos e documentos | C |
| GET | `/pacientes/:id/prontuario/pdf` | Exportação em PDF | C |
| GET | `/pacientes/:id/acessos` | Quem abriu o prontuário | C, AC |
| GET/POST/PATCH | `/procedimentos` (catálogo) | Nome, código, duração, valor | C, AC |
| GET/POST | `/pacientes/:id/procedimentos` | Registro por dente e face | C |
| PATCH | `/procedimentos-paciente/:id` | Edita (concluído só por adendo — RN-006) | C |
| GET | `/pacientes/:id/odontograma` | Situação por elemento | C |
| GET/POST | `/planos-tratamento` · POST `/planos-tratamento/:id/aprovar` | Orçamento → contas a receber | C, AC |

### 4.5 Ordens de serviço — `modules/ordens-servico`

| Método | Rota | Descrição | Perfis |
|---|---|---|---|
| GET | `/ordens-servico?etapa=&origem=&cliente=&periodo=&busca=` | Quadro e lista | S, C, L, AL |
| POST | `/ordens-servico` | Cria (da clínica ou do laboratório) | S, C, L |
| GET/PATCH | `/ordens-servico/:id` | Detalhe / edição | S, L |
| PATCH | `/ordens-servico/:id/etapa` | Move no Kanban (exige laboratório e prazo para "Envio" — RN-003) | S, L |
| POST | `/ordens-servico/:id/cancelar` | Cancela com motivo | S, L |
| GET | `/ordens-servico/:id/historico` | Histórico de etapas (RN-012) | S, L, AL |
| POST | `/ordens-servico/:id/anexos` | Fotos, escaneamento, documentos | S, L |
| POST | `/ordens-servico/:id/tecnico` | Atribui técnico | L, AL |
| POST | `/ordens-servico/:id/provas` · `/refacoes` | Prova devolvida e refação com motivo | L |
| GET | `/ordens-servico/atrasadas` | Atrasadas e a vencer (RN-004) | S, L, AL |
| GET/POST | `/laboratorio/clientes` | Clientes do laboratório (internos e externos) | L, AL |
| GET/PATCH | `/laboratorio/clientes/:id` | Detalhe / edição | L, AL |

### 4.6 Estoque — `modules/estoque`

| Método | Rota | Descrição | Perfis |
|---|---|---|---|
| GET | `/estoque/produtos?unidade=&busca=` | Saldo por produto e lote | L, AC, AL |
| POST/PATCH | `/estoque/produtos` · `/:id` | Cadastro de produto | AC, AL |
| POST | `/estoque/entradas` | Entrada com lote, validade, custo e NF | AC, AL, L* |
| POST | `/estoque/retiradas` | Retirada (bloqueia saldo negativo — RN-005; aceita `os_id`) | L, AC, AL |
| POST | `/estoque/ajustes` | Inventário com justificativa | AC, AL |
| GET | `/estoque/movimentacoes?tipo=&periodo=` | Histórico de retiradas e entradas | L, AC, AL |
| GET | `/estoque/alertas` | Abaixo do mínimo e validade em 30 dias | L, AC, AL |
| GET | `/estoque/custo-por-os?os_id=` | Material consumido por OS | AL |

`L*` — só quando a permissão do perfil Laboratório estiver habilitada.

### 4.7 Financeiro — `modules/financeiro`

| Método | Rota | Descrição | Perfis |
|---|---|---|---|
| GET | `/financeiro/fluxo-caixa?unidade=&inicio=&fim=` | Receitas, despesas, saldo, previsto e realizado | AC, AL |
| GET/POST | `/financeiro/lancamentos` | Lista e cria (parcelamento e recorrência) | AC, AL |
| PATCH | `/financeiro/lancamentos/:id` · POST `/:id/baixa` | Edita e dá baixa total/parcial | AC, AL |
| GET | `/financeiro/caixa/hoje` · POST `/financeiro/caixa/fechar` | Fechamento por forma de pagamento | AC |
| POST | `/financeiro/caixa/:id/reabrir` | Reabertura justificada (RN-011) | AC |
| GET | `/financeiro/contas-receber` · `/contas-pagar` | Títulos em aberto | AC, AL |
| GET | `/financeiro/extratos/:clienteId` | Extrato mensal por clínica/dentista | AL |
| GET/PUT | `/laboratorio/tabela-precos` | Preços por tipo de trabalho e cliente | AL |
| POST | `/financeiro/recibos/:lancamentoId` | Recibo em PDF | AC |
| GET | `/financeiro/comissoes?periodo=` | Comissões por profissional — *Desejável* | AC |
| GET | `/financeiro/exportar/carne-leao` | CSV Receita Saúde — *Desejável* | AC |

### 4.8 Relatórios — `modules/relatorios`

| Método | Rota | Descrição | Perfis |
|---|---|---|---|
| GET | `/relatorios/clinica/geral?periodo=&profissional=` | Consultas, faltas, novos pacientes, faturamento, ticket médio | AC |
| GET | `/relatorios/clinica/procedimentos` | Mais realizados | AC |
| GET | `/relatorios/clinica/profissionais` | Consultas, faltas e faturamento por dentista | AC |
| GET | `/relatorios/laboratorio/os` | Por etapa, cliente, técnico e tipo (com valores) | AL |
| GET | `/relatorios/laboratorio/os/operacional` | Mesma base **sem valores** (RF-LAB-020) | L |
| GET | `/relatorios/laboratorio/tecnicos` | Produtividade e tempo médio | L, AL |
| GET | `/relatorios/laboratorio/geral` | Faturamento, custos, margem, clientes | AL |
| — | `?formato=pdf\|xlsx` em todas | Exportação respeitando os filtros | — |

---

## 5. Backend — Regras de negócio a implementar

- [x] RN-001 CPF único e válido; paciente sem CPF exige responsável — `lib/validacoes.js` (dígitos verificadores) + unicidade por hash + CHECK no banco; testado com CPF formatado/duplicado/inválido e menor sem CPF com responsável
- [x] RN-002 Sem sobreposição de horário por profissional/cadeira — EXCLUDE por profissional e por cadeira no Postgres; testado (409 com mensagem distinta) e com horários vizinhos permitidos
- [ ] RN-003 "Envio" exige laboratório e data prevista
- [ ] RN-004 OS atrasada = previsão < hoje e não concluída
- [ ] RN-005 Retirada não deixa saldo negativo
- [ ] RN-006 Sem exclusão de registro clínico; correção por adendo
- [ ] RN-007 Secretaria, Clínica e Laboratório não acessam financeiro
- [ ] RN-008 Estoque e financeiro separados por unidade
- [x] RN-009 Paciente com histórico só é inativado — `DELETE /pacientes/:id` inativa se houver consulta e exclui se não houver; `temHistorico()` é o ponto único a estender nos M3/M4
- [x] RN-010 Faltou/Cancelada libera horário e conta no absenteísmo — faltou/cancelada saem da restrição de conflito; testado: reagendar no mesmo horário após cancelar e após faltou. Falta o indicador de absenteísmo (M7)
- [ ] RN-011 Caixa fechado só muda após reabertura justificada
- [ ] RN-012 Toda mudança de etapa grava usuário e data/hora
- [ ] RN-013 OS da clínica chegam integradas; das externas, cadastro manual
- [ ] RN-014 Administrador só acessa finanças, estoque, relatórios e usuários do próprio setor
- [ ] Testes automatizados cobrindo cada regra acima (Vitest/Jest + supertest)

---

## 6. Frontend web (React + TypeScript + Vite)

### 6.1 Base

- [ ] Projeto Vite + React + TS, path alias, variáveis de ambiente — projeto, `.env` (`VITE_API_URL`) e proxy `/api` prontos; falta o path alias (`@/…`)
- [x] Cliente HTTP com `credentials: 'include'` (sessão por cookie httpOnly) — o front não lê nem guarda token; renovação é transparente, feita pelo backend — `api/client.ts` (openapi-fetch): cookie httpOnly, CSRF só em memória, 401 → renovação única (single-flight) e repetição. 6 testes do cliente; no navegador, `Revelar`, cadastro e quadro funcionando com sessão por cookie
- [x] Nenhum dado sensível persistido no dispositivo: cache do TanStack Query só em memória, limpo no logout; sem `localStorage` para dado de paciente, financeiro ou de sessão — provado no navegador após logout: `/auth/me` = 401, `localStorage`/`sessionStorage`/`IndexedDB` = 0, `document.cookie` vazio (cookies httpOnly); nenhuma ocorrência dessas APIs no código nem no bundle; `queryClient.clear()` no logout e na expiração
- [x] Rotas protegidas no front são só conveniência de navegação — a permissão real vem da API a cada requisição — provado: `adm_laboratorio` abrindo `/pacientes` é redirecionado, e chamando a API direto recebe 403 em pacientes, consultas, profissionais e bloqueios
- [x] Sem segredo no bundle: apenas `VITE_API_URL` e flags públicas; nenhuma chave de terceiros no código do front — build de produção inspecionado: 0 ocorrências de `JWT_SECRET`, `ENC_KEY`, `HMAC_KEY`, `DB_PASSWORD`, `SMTP_PASSWORD` nem do valor do segredo JWT; só `VITE_API_URL` (opcional)
- [x] Campos sensíveis (CPF, telefone, documentos) exibidos mascarados, com ação "revelar" que chama a API e fica na auditoria — ficha e listas mascaradas; `Revelar` busca na API (auditado), mostra por 20 s e some; o valor vive só no estado da tela
- [x] Tipos gerados do OpenAPI (`openapi-typescript`) — sem tipo escrito à mão para payload de API — `npm run gen:api` gera `src/api/schema.d.ts` do `/api-docs.json` (contrato em `src/openapi-contrato.js`); nenhum tipo de payload escrito à mão; o `tsc` já apontou um erro real de contrato (null em `$ref`)
- [x] TanStack Query (cache, revalidação, estados de carregando/erro/vazio) — cache só em memória, estados de carregando (skeleton), erro (com “tentar de novo”) e vazio nas telas do M1/M2
- [x] React Router com rotas protegidas por perfil + redirecionamento pós-login — menu por perfil, guardas de rota e redirecionamento pós-login (`state.de` ou página inicial do perfil); telas pesadas carregadas sob demanda
- [x] React Hook Form + Zod nos formulários (mesmas regras do backend) — paciente (RN-001 espelhada), consentimento, usuário, profissional, login e nova senha; 5 testes do formulário de paciente (CPF inválido, sem CPF exige responsável, máscaras, corpo enviado, foco/Esc)
- [ ] Design tokens do protótipo (cores, tipografia Bricolage Grotesque + Figtree, raios, espaçamentos) — fontes Bricolage Grotesque + Figtree (pacotes locais, sem CDN) e tokens em `styles/tokens.css`, mas as cores são PROVISÓRIAS — o protótipo de 29 telas não está no repositório
- [ ] Componentes base: Button, Input, Select, Textarea, Checkbox, Radio, Badge, Card, Table, Tabs, Segmented, Modal, Drawer, Toast, EmptyState, Skeleton — existem Button, Campo (Input/Select/Textarea com rótulo/erro/dica), Checkbox, Badge, Card, Table (vira cartões no celular), Abas, Modal, Drawer, Toast, EmptyState, Skeleton, Paginação, ConfirmDialog; faltam Radio e Segmented
- [ ] Layout com menu lateral por perfil, barra superior, busca e notificações — menu lateral por perfil (barra inferior no celular), barra superior e notificações com contador; falta a busca global
- [ ] Quadro Kanban reutilizável com arrastar e soltar (dnd-kit) — agenda, OS da clínica e produção do laboratório — quadro do dia funcionando com `dnd-kit` (arrastar Confirmada → Chegou provado no navegador) e botões por teclado; ainda não extraído como componente genérico para as OS (M3)
- [x] Componente de calendário semanal (grade de horários, filtro por profissional, bloqueios hachurados) — grade semana/dia com filtro por profissional, eventos lado a lado quando sobrepostos, jornada e bloqueios hachurados — verificado no navegador; falta a visão de mês
- [ ] Odontograma interativo (seleção por dente e face)
- [ ] Gráficos (Recharts) para financeiro e relatórios
- [ ] Máscaras: CPF, CNPJ, telefone, CEP, moeda (pt-BR) — CPF, celular e CEP prontos e testados; CNPJ e moeda entram com M3/M6
- [ ] Acessibilidade: foco visível, rótulos reais, contraste 4.5:1, alvo de toque ≥44px — contraste medido nos 23 pares de cor dos tokens: todos ≥ 4,5:1 (mínimo 4,56); rótulos reais ligados por `aria-*`, foco preso em modal/drawer e Esc fecha (testado), alvos ≥ 44 px; ressalva: a cor do profissional é livre e pode ficar abaixo do contraste com texto branco; falta teste com leitor de tela
- [ ] Testes: Vitest + Testing Library nos fluxos críticos; Playwright no caminho login → agendar → criar OS — 22 testes Vitest (máscaras, datas, layout da agenda, cliente HTTP, formulário); Playwright (login → agendar → criar OS) ainda não

### 6.2 Telas (rota → protótipo)

| Rota | Tela | Perfil |
|---|---|---|
| [x] `/login` | Entrada *(também `/esqueci-senha` e `/redefinir-senha/:token`; fluxo de convite provado de ponta a ponta)* | público |
| [x] `/pacientes` | Lista + cadastro em drawer *(lista com busca, paginação e cadastro em drawer; provado no navegador)* | S |
| [x] `/pacientes/:id` | Ficha do paciente *(dados, endereço, responsável, próximas consultas e consentimentos; falta o prontuário (M4))* | S, C |
| [x] `/agenda` | Semana (dia/mês na mesma tela) *(semana e dia; falta a visão de mês e a tela de bloqueios (a API existe))* | S |
| [x] `/agenda/quadro` | Quadro do dia por status | S |
| [ ] `/ordens-servico` | Kanban de OS | S |
| [ ] `/clinica/prontuario/:id` | Prontuário, odontograma, linha do tempo | C |
| [ ] `/clinica/anamnese/:id` | Anamnese versionada + assinatura | C |
| [ ] `/clinica/procedimentos` | Registro + catálogo | C |
| [ ] `/lab/producao` | Kanban de produção | L |
| [ ] `/lab/estoque` | Estoque + retirada vinculada à OS | L |
| [ ] `/lab/clientes` | Clientes do laboratório | L |
| [ ] `/lab/relatorio-os` | Relatório operacional | L |
| [ ] `/admin/clinica/financeiro` | Fluxo de caixa e caixa do dia | AC |
| [ ] `/admin/clinica/relatorios` | Indicadores da clínica | AC |
| [ ] `/admin/clinica/estoque` | Estoque + entrada | AC |
| [x] `/admin/clinica/usuarios` | Usuários + auditoria *(rota real `/admin/clinica`, com abas Usuários, Profissionais e jornada, Auditoria)* | AC |
| [ ] `/admin/lab/financeiro` | A receber, a pagar, tabela de preços | AL |
| [ ] `/admin/lab/relatorio-os` | Relatórios de OS com valores | AL |
| [ ] `/admin/lab/relatorios` | Faturamento, custos, margem | AL |
| [ ] `/admin/lab/estoque` | Estoque + custo por OS | AL |
| [x] `/admin/lab/usuarios` | Usuários + permissões do perfil *(rota real `/admin/lab`, com abas Usuários, Permissões do Laboratório, Auditoria)* | AL |

---

## 7. Mobile — Fase 1 (PWA responsivo)

Mesmo app React: as rotas são as mesmas, o layout muda abaixo de 768px (menu lateral vira navegação inferior).

### 7.1 Infraestrutura PWA

- [ ] `vite-plugin-pwa` configurado
- [ ] `manifest.webmanifest`: nome, cor do tema, ícones 192/512 e maskable, `display: standalone`, `orientation: portrait`
- [ ] Service worker: precache do app shell; API com estratégia *network-first* e fallback de cache
- [ ] Tela de offline e aviso de "sem conexão" no topo
- [ ] Convite de instalação (banner discreto, uma vez por usuário)
- [ ] Versionamento do SW + aviso "nova versão disponível"
- [ ] Service worker nunca guarda resposta de API com dado clínico ou financeiro (essas rotas ficam network-only, com `no-store`); o cache cobre só o shell do app
- [ ] Nada de dado sensível no dispositivo além da sessão em memória; ao sair, o app limpa caches e dados do navegador

### 7.2 Layout e interação

- [ ] Breakpoint único (`<768px`) controlando shell mobile × desktop
- [ ] Barra de navegação inferior por perfil (4 itens) com `env(safe-area-inset-bottom)`
- [ ] Cabeçalho compacto com título, contexto e notificações
- [ ] Kanban vira **lista com filtros de etapa em chips** (arrastar não funciona bem em tela pequena)
- [ ] Alvos de toque ≥44px, fontes ≥14px, `inputmode`/`type` corretos (tel, email, number)
- [ ] Listas com rolagem virtualizada e paginação infinita
- [ ] Puxar para atualizar nas listas principais
- [ ] Botão flutuante de ação principal (nova consulta, novo paciente, nova OS)
- [ ] Anexos pelo celular: `<input type="file" accept="image/*" capture>` com compressão antes do upload
- [ ] Link do WhatsApp abrindo o aplicativo no celular
- [ ] Teste real em iOS (Safari) e Android (Chrome), incluindo teclado aberto sobre formulários

### 7.3 Telas mobile (protótipo)

- [ ] Entrar
- [ ] Agenda do dia (lista por horário + filtros de status)
- [ ] Pacientes (busca + lista + ação de WhatsApp)
- [ ] Ordens de serviço (filtros por etapa + cartões)
- [ ] Prontuário (alertas, linha do tempo, plano de tratamento, nova evolução)
- [ ] Produção do laboratório (filtro por origem, etapa e técnico)
- [ ] Estoque do laboratório (alerta de mínimo + registrar retirada)
- [ ] Financeiro (saldo, receitas/despesas, últimos lançamentos)

---

## 8. Mobile — Fase 2 (React Native + Expo)

Preparar ainda na fase 1, para o app nativo não exigir retrabalho no backend:

- [ ] API versionada (`/api/v1`) e contrato OpenAPI publicado
- [ ] Refresh token de sessão longa, revogável por dispositivo (tabela `dispositivos`)
- [ ] Endpoint de registro de dispositivo para push (`POST /dispositivos`)
- [ ] Payload de notificação já definido (OS mudou de etapa, consulta confirmada, estoque mínimo)
- [ ] Upload de anexo por URL assinada, sem depender de sessão de navegador
- [ ] Respostas paginadas e enxutas (sem campos que só a tela grande usa)

Depois, o app em si:

- [ ] Projeto Expo + TypeScript reaproveitando tipos do OpenAPI
- [ ] Navegação por abas equivalente ao PWA
- [ ] Push (FCM/APNs) e deep links para OS e consulta
- [ ] Câmera nativa para anexos clínicos
- [ ] Armazenamento seguro do token (Keychain/Keystore)
- [ ] Publicação na App Store e Play Store (contas, política de privacidade, termos)

---

## 9. Integrações

- [ ] WhatsApp por link `wa.me` com mensagem pré-preenchida (sem API paga — decisão D-03)
- [ ] E-mail transacional (convite, redefinição de senha, recibo)
- [ ] Exportações CSV/XLSX e PDF em listagens e relatórios
- [ ] Importação de pacientes por planilha (migração de outro sistema)
- [ ] *Em aberto na URS:* convênios (Q-01) e nota fiscal de serviço (Q-02) — não implementar antes da decisão

---

## 10. Infraestrutura, deploy e operação

- [ ] Docker Compose de desenvolvimento subindo api + db + web com um comando
- [ ] Build de produção da API e do front (front servido estático pelo Nginx)
- [ ] VPS + Nginx como proxy reverso, HTTPS com Let's Encrypt e renovação automática
- [ ] GitHub Actions: lint → testes → build → deploy
- [ ] Logs estruturados (nível, requisição, usuário, latência) com rotação
- [ ] Backup diário do Postgres + restauração testada
- [ ] Ambiente de homologação separado do de produção
- [ ] Checklist de LGPD: política de privacidade, termo de consentimento, retenção do prontuário por 20 anos, processo para pedido do titular

---

## 11. Ordem sugerida de execução

| Marco | Entrega | Depende de |
|---|---|---|
| **M1** | Fundação + auth + usuários + perfis | — |
| **M2** | Pacientes + agenda (semana e quadro) | M1 |
| **M3** | Ordens de serviço (clínica ↔ laboratório) + produção | M2 |
| **M4** | Prontuário, anamnese e procedimentos | M2 |
| **M5** | Estoque (duas unidades) | M1 |
| **M6** | Financeiro (clínica e laboratório) | M3, M5 |
| **M7** | Relatórios e exportações | M2–M6 |
| **M8** | PWA: navegação mobile e telas do protótipo | M2–M6 |
| **M9** | Deploy, backup, CI/CD e checklist de LGPD | M1 |
| **M10** | App nativo (Expo) | M8 |

---

## 12. Regras de trabalho (valem para todo item)

- [ ] Ler `tasks/lessons.md` no início de cada sessão
- [ ] Item só vira `[x]` com o fluxo real executado (Swagger ou tela) e log conferido
- [ ] Toda rota nova sai com `@swagger` no mesmo commit
- [ ] Toda query com parâmetros; nenhuma senha em log; segredos só no `.env`
- [ ] Toda rota nova nasce autenticada e autorizada no servidor (negar por padrão) — sem exceção "só para testar"
- [ ] Campo novo é classificado na tabela da seção 3.1 antes de ir para o schema — cifrado, com hash de busca ou em claro, nunca "decide depois"
- [ ] Nenhum token, segredo ou dado sensível trafega para o front além do que a tela mostra
- [ ] Erro do cliente nunca recebe stack trace
- [ ] Correção apontada pelo usuário vira regra em `tasks/lessons.md` no mesmo turno
- [ ] Bug: reproduzir → logs → causa raiz (sem remendo que mascara sintoma)
