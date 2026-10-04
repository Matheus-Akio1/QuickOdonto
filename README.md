# QuickOdonto

**Sistema de gestão que integra uma clínica odontológica e um laboratório de prótese dentária no mesmo fluxo de trabalho.**

![Status](https://img.shields.io/badge/status-em%20desenvolvimento-F2B880)
![Backend](https://img.shields.io/badge/backend-Node.js%20%2B%20Express-0F6B63)
![Banco](https://img.shields.io/badge/banco-PostgreSQL-1B438F)
![Frontend](https://img.shields.io/badge/frontend-React%20%2B%20TypeScript-43339A)
![LGPD](https://img.shields.io/badge/LGPD-por%20design-05603A)

[Português](#portugu%C3%AAs) · [English](#english)

---

## Português

### O problema

Clínicas odontológicas que trabalham com prótese vivem um vaivém manual: a secretaria anota a ordem de serviço num caderno, liga para o laboratório para saber se a peça ficou pronta, e o dentista descobre no dia da consulta que o trabalho atrasou. Quem administra não sabe quanto cada trabalho custou nem qual é a margem real.

O QuickOdonto conecta as duas pontas. A ordem de serviço nasce no atendimento, segue a produção no laboratório e volta para a agenda — com o financeiro e o estoque das duas unidades separados, como a operação exige.

### O que o sistema faz

Cinco painéis, um por perfil de usuário:

| Painel | O que entrega |
|---|---|
| **Secretaria** | Cadastro de pacientes, agenda em grade semanal e quadro de status estilo Trello, ordens de serviço em fluxo visual |
| **Clínica (dentista)** | Anamnese com histórico de versões, prontuário com odontograma e linha do tempo, registro de procedimentos por dente e face |
| **Laboratório** | Lista de ordens de serviço da clínica e de clientes externos, cadernos por cliente, estoque com baixa vinculada à OS |
| **Administração da Clínica** | Fluxo de caixa, fechamento diário, indicadores, estoque, usuários e trilha de auditoria |
| **Administração do Laboratório** | Faturamento por cliente, extrato de serviços pronto para enviar à clínica, composição de custos, pagamento da equipe e margem de lucro |

Regras que o sistema precisa garantir, e não só exibir: prontuário sem exclusão (correção por adendo), estoque que não fica negativo, agenda sem conflito de horário, e separação total entre os dados da clínica e os do laboratório.

### Stack

| Camada | Tecnologia | Por quê |
|---|---|---|
| Backend | **Node.js + Express** | API em monolito modular — um módulo por domínio (`auth`, `pacientes`, `agenda`, `ordens-servico`, `estoque`, `financeiro`), cada um com rotas, serviço e acesso a dados separados |
| Banco | **PostgreSQL 16** | Prontuário, ordem de serviço e financeiro exigem integridade referencial e transação |
| Documentação da API | **Swagger / OpenAPI** | Contrato entre backend, web e app — e tipos do frontend gerados a partir dele |
| Frontend | **React + TypeScript + Vite** | Tipagem ponta a ponta com o contrato da API |
| Dados e estado | **TanStack Query**, React Hook Form + Zod | Cache, revalidação e validação com as mesmas regras do servidor |
| Mobile | **PWA responsivo** (fase 1) · **React Native + Expo** (fase 2) | Um código só para começar; app nativo quando o uso justificar |
| Infra | **Docker + Docker Compose**, Nginx, GitHub Actions | Ambiente reproduzível e pipeline de build, teste e deploy |

### Decisões de arquitetura e segurança

Sistema de saúde lida com dado pessoal sensível, então a segurança é requisito, não enfeite:

- **Autenticação e autorização no servidor, negando por padrão.** O frontend esconde o que o perfil não usa por conveniência visual; quem autoriza é sempre a API. Chamar a rota por fora retorna 403.
- **Sessão em cookie `httpOnly` + `Secure` + `SameSite`.** Nenhum token em `localStorage`, nada de segredo no bundle do frontend.
- **Criptografia por classificação de dado**, em vez de criptografar tudo às cegas: texto clínico e documentos cifrados por campo, anexos cifrados com URL assinada, CPF com hash determinístico para permitir busca, e dados operacionais em claro protegidos por controle de acesso. Campo cifrado não se busca nem se soma — a escolha é consciente, e está documentada.
- **Custódia de chave e teste de restauração.** Prontuário tem guarda legal longa: perder a chave é perder o dado. Cópia em cofre, cópia offline e restauração testada por trimestre.
- **Trilha de auditoria e registro de acesso ao prontuário**, com dados mascarados na tela por padrão.
- **Conformidade com a LGPD e com a Lei nº 13.787/2018** (guarda de prontuário) consideradas desde a especificação.

### Documentação do projeto

Antes da primeira linha de código, o projeto passou por especificação e protótipo:

- **URS — Especificação de Requisitos do Usuário:** 11 seções, cerca de 120 requisitos funcionais e não funcionais, 14 regras de negócio, matriz de acesso por perfil e rastreabilidade com o levantamento inicial.
- **[Checklist de desenvolvimento](CHECKLIST_DESENVOLVIMENTO.md):** o plano de execução — modelagem do banco, cerca de 90 rotas da API com método, perfil e critério de aceitação, frontend tela a tela, PWA, infraestrutura e marcos.
- **Protótipo navegável:** 35 telas de desktop e celular, cobrindo os cinco painéis.

### Status

| Fase | Situação |
|---|---|
| Levantamento e URS | Concluído |
| Protótipo de interface | Concluído |
| Checklist técnico e modelagem | Concluído |
| Backend — fundação, auth e perfis | Em andamento |
| Módulos, frontend e PWA | A fazer |

Roadmap por marcos: fundação e autenticação → pacientes e agenda → ordens de serviço → prontuário → estoque → financeiro → relatórios → PWA → deploy → app nativo.

### Autor

Desenvolvido por [Matheus Akio](https://github.com/Matheus-Akio1) — projeto nascido de uma necessidade real de uma clínica com laboratório próprio.

---

## English

### The problem

Dental clinics that work with prosthetics still run on paper: the front desk writes the lab order in a notebook, calls the lab to ask whether the piece is ready, and the dentist finds out on appointment day that the work is late. Management has no idea what each job cost or what the real margin is.

QuickOdonto connects both ends. A lab order starts at the appointment, moves through production at the lab and comes back to the schedule — with finances and inventory kept separate for each unit, the way the business actually works.

### What the system does

Five panels, one per user role:

| Panel | What it delivers |
|---|---|
| **Front desk** | Patient records, weekly calendar plus a Trello-style status board, lab orders in a visual flow |
| **Clinic (dentist)** | Versioned medical history, patient chart with odontogram and timeline, procedures logged per tooth and surface |
| **Lab** | Orders from the clinic and from external clients, one notebook per client, inventory withdrawals tied to each order |
| **Clinic admin** | Cash flow, daily closing, KPIs, inventory, users and audit trail |
| **Lab admin** | Revenue per client, service statement ready to send to the clinic, cost breakdown, team payout and profit margin |

Rules the system must enforce, not merely display: chart records are never deleted (corrections are addenda), inventory never goes negative, no double-booked appointments, and full data separation between clinic and lab.

### Stack

| Layer | Technology | Why |
|---|---|---|
| Backend | **Node.js + Express** | Modular monolith — one module per domain (`auth`, `patients`, `schedule`, `lab-orders`, `inventory`, `finance`), each with its own routes, service and data access |
| Database | **PostgreSQL 16** | Charts, lab orders and finance need referential integrity and transactions |
| API docs | **Swagger / OpenAPI** | The contract between backend, web and app — frontend types are generated from it |
| Frontend | **React + TypeScript + Vite** | End-to-end typing against the API contract |
| Data & state | **TanStack Query**, React Hook Form + Zod | Caching, revalidation and validation mirroring server rules |
| Mobile | **Responsive PWA** (phase 1) · **React Native + Expo** (phase 2) | One codebase first; a native app when usage justifies it |
| Infra | **Docker + Docker Compose**, Nginx, GitHub Actions | Reproducible environment and a build/test/deploy pipeline |

### Architecture and security decisions

Healthcare software handles sensitive personal data, so security is a requirement, not a decoration:

- **Authentication and authorization on the server, deny by default.** The frontend hides what a role cannot use purely for clarity; the API is what authorizes. Hitting the route directly returns 403.
- **Session in an `httpOnly` + `Secure` + `SameSite` cookie.** No tokens in `localStorage`, no secrets in the frontend bundle.
- **Encryption driven by data classification** rather than blanket encryption: clinical free text and documents encrypted per field, attachments encrypted and served through signed URLs, national ID hashed deterministically so it stays searchable, and operational data kept readable but protected by access control. Encrypted columns cannot be searched or aggregated — the trade-off is deliberate and documented.
- **Key custody and restore drills.** Patient records carry a long legal retention period: losing the key means losing the data. Vault copy, offline copy and a quarterly restore test.
- **Audit trail and chart-access logging**, with sensitive fields masked on screen by default.
- **Compliance with Brazil's LGPD and Law 13.787/2018** (patient record retention) considered from the specification stage.

### Project documentation

Specification and prototype came before the first line of code:

- **URS — User Requirements Specification:** 11 sections, around 120 functional and non-functional requirements, 14 business rules, a role access matrix and traceability back to the original brief.
- **[Development checklist](CHECKLIST_DESENVOLVIMENTO.md):** the execution plan — data model, roughly 90 API routes with method, role and acceptance criteria, screen-by-screen frontend, PWA, infrastructure and milestones.
- **Clickable prototype:** 35 desktop and mobile screens covering all five panels.

### Status

| Phase | State |
|---|---|
| Requirements and URS | Done |
| Interface prototype | Done |
| Technical checklist and data model | Done |
| Backend — foundation, auth and roles | In progress |
| Modules, frontend and PWA | To do |

Milestone roadmap: foundation and auth → patients and scheduling → lab orders → patient charts → inventory → finance → reports → PWA → deployment → native app.

### Author

Built by [Matheus Akio](https://github.com/Matheus-Akio1) — a project born from a real need at a clinic with its own prosthetics lab.
