# Plano da tarefa atual — M4 (Prontuário) — backend e front concluídos

Referência: `CHECKLIST_DESENVOLVIMENTO.md`, seções 2.1, 3, 3.1, 3.2, 4.4, 5, 6.1 e 6.2.

## Feito
1. [x] Backend do prontuário (ver checklist): RN-006 por trigger, acesso registrado, texto clínico e anexos cifrados
2. [x] Front: `/clinica/prontuario/:id` (alertas, linha do tempo, evoluções/adendos, odontograma, plano, anexos, acessos, PDF),
       `/clinica/anamnese/:id`, `/clinica/procedimentos` (+ aba Catálogo na administração da clínica)
3. [x] Ligações: "Abrir prontuário" na ficha e no drawer da consulta (só dentista); menu "Procedimentos" para o dentista
4. [x] Conteúdo clínico no front com `gcTime: 0` (não fica em memória depois de sair da tela)
5. [x] 103 testes backend + 31 front; fluxo percorrido no navegador como Dentista, Secretaria e Adm. Clínica; celular conferido
6. [x] Bugs achados na validação e corrigidos: arcada cortada/inalcançável, ordem dos itens do plano, PDF de anexo
       sem visualizador (agora baixa), rolagem até o painel do dente no celular

## Pendências
- [ ] Planos aprovados → contas a receber (M6)
- [ ] Exportação xlsx de pacientes por link de uso único
- [ ] Anexos de OS quando o M3 existir
- [ ] Script de rotação de chave (formato já versionado: `v1:` / `QOA1`)
- [ ] Backup do volume `anexos_data` junto com o Postgres (M9)
- [ ] Playwright cobrindo login → prontuário → evolução (hoje validado à mão no navegador)
- [ ] Próximo marco: M3 (ordens de serviço) ou M5 (estoque)

## Observações
- Testes rodam no container (`docker compose exec api npx jest --runInBand`) contra o banco **`quickodonto_test`** (criado e migrado pelo `tests/globalSetup.js`, truncado a cada execução) — nunca no de dev. O mailer é mockado.
- E-mails de dev caem no Mailpit: http://localhost:8025 (`SMTP_HOST=mailpit` no `.env`).
- Após instalar dependência nova: `docker compose up -d --build -V api` (o `-V` renova o volume anônimo de `node_modules`).
- Seed de dev: usuários `*@quickodonto.test` por perfil; senha em `seeds/01_usuarios_dev.js` (só dev).
