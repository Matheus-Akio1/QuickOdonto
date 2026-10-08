# Plano da tarefa atual — M4 (Prontuário) — ⚠️ BLOQUEADO: disco cheio, Docker não inicia

Referência: `CHECKLIST_DESENVOLVIMENTO.md`, seções 2.1 (prontuário), 3, 3.1, 4.4 e 5 (RN-006).

## Escrito, AINDA NÃO EXECUTADO (nada marcado [x] no checklist)
1. [ ] Migration `20261009000001_prontuario.js`: anamneses, evolucoes, adendos, anexos, acessos_prontuario,
       links_download, procedimentos_catalogo, procedimentos_paciente, procedimento_adendos, planos_tratamento, plano_itens
       — imutabilidade (RN-006) por trigger; FKs RESTRICT para pacientes
2. [ ] `lib/odonto.js` (FDI), `lib/arquivoCifrado.js` (anexo cifrado + assinatura binária), `lib/links.js` (uso único, 60 s)
3. [ ] Serviços e rotas: prontuário/linha do tempo, anamnese versionada + assinatura, evoluções + adendos,
       acessos (RF-CLI-015), catálogo, procedimentos por dente/face, odontograma, planos, anexos, PDF
4. [ ] `temHistorico()` estendido ao prontuário (RN-009); `authMiddleware`/`auditar` idempotentes
5. [ ] Seed `03_catalogo_dev.js`; volume `anexos_data` no compose; `STORAGE_DIR` no `.env`
6. [ ] `tests/m4.test.js` (~35 testes) — escrito, não rodado
7. [ ] Contrato OpenAPI do M4 (53 rotas / 41 schemas — carrega sem erro) e tipos do front regenerados

## Feito e verificado nesta etapa
- [x] Busca de paciente fora da URL: `POST /pacientes/buscar`; `GET /pacientes?busca=` → 400. 71 testes backend verdes
      (rodados ANTES do Docker cair). Front ajustado; `tsc`/lint/22 testes Vitest verdes; casts `as never` removidos.

## Para retomar (depois de liberar espaço)
1. `docker compose up -d --build -V --force-recreate api`
2. `docker compose exec api npx knex migrate:latest && docker compose exec api npx knex seed:run`
3. `docker compose exec api npx jest --runInBand --forceExit` → corrigir o que falhar
4. Fluxo real via curl/navegador; só então marcar o checklist

## Observações
- Testes rodam no container (`docker compose exec api npx jest --runInBand`) contra o banco **`quickodonto_test`** (criado e migrado pelo `tests/globalSetup.js`, truncado a cada execução) — nunca no de dev. O mailer é mockado.
- E-mails de dev caem no Mailpit: http://localhost:8025 (`SMTP_HOST=mailpit` no `.env`).
- Após instalar dependência nova: `docker compose up -d --build -V api` (o `-V` renova o volume anônimo de `node_modules`).
- Seed de dev: usuários `*@quickodonto.test` por perfil; senha em `seeds/01_usuarios_dev.js` (só dev).
