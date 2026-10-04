# Plano da tarefa atual — Fase 0 (Fundação)

Referência: `CHECKLIST_DESENVOLVIMENTO.md`, seção 1.

## Objetivo
Deixar o monorepo pronto para começar o M1 (fundação + auth + usuários + perfis): API Express rodando em Docker, Postgres subindo, Swagger abrindo, lint/format configurados nos dois projetos.

## Passos
1. [x] `tasks/todo.md` e `tasks/lessons.md`
2. [x] `.gitignore` (`.env`, `node_modules`, `dist`, etc.)
3. [x] Backend (raiz): `package.json`, `src/index.js`, `src/config/db.js`, `src/swagger.js`, `src/middleware/errorHandler.js`, `src/modules/` (estrutura), rota `GET /health`
4. [x] `.env` e `.env.example` (`DB_*`, `JWT_SECRET`, `JWT_EXPIRES`, `APP_URL`, `SMTP_*`)
5. [x] ESLint + Prettier + EditorConfig no backend
6. [x] Frontend `web/`: Vite + React + TS mínimo, ESLint + Prettier (trocado o `oxlint` padrão do scaffold por ESLint, como o checklist pede)
7. [x] `Dockerfile` da API (raiz) e `web/Dockerfile`; `docker-compose.yml` (api, db, web)
8. [x] Subido via `docker compose up -d --build`: `GET /health` → 200, `/api-docs` → 200, `web` → 200. Logs dos três serviços limpos.
9. [x] Itens da Fase 0 marcados `[x]` no checklist, com a prova anotada na própria linha
10. [x] Perguntado ao usuário — decidiu **não commitar agora**; revisará e commitará ele mesmo

## Observações da execução
- Porta 5432 do host já estava ocupada (outro processo/VM do Docker Desktop) — o Postgres do compose foi mapeado para `5433:5432` no host. Dentro da rede Docker o serviço `api` continua falando com `db:5432` normalmente.
- Branch `main` no GitHub: não há `gh` instalado nesta máquina para verificar/configurar proteção de branch, e é uma ação administrativa em sistema remoto — deixei para o usuário confirmar manualmente.
- Containers ficaram rodando ao final da tarefa (`docker compose ps` mostra os três `Up`). Parar com `docker compose down` quando não precisar mais.

## Próximo marco após esta tarefa (M1)
Autenticação (`POST /auth/login`, JWT, bcrypt), tabela `usuarios`, middlewares `authMiddleware` e `permitirPerfis`, testes de caminho permitido/bloqueado.

## Decisões tomadas nesta tarefa
- Backend mora na raiz do repo (`src/...`, conforme os caminhos literais do checklist), frontend em `web/`.
- Migrations com Knex (a decidir definitivamente ao criar as tabelas reais — checklist pede Knex ou Prisma antes do primeiro deploy).
