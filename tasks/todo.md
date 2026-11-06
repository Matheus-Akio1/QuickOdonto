# Plano da tarefa atual — M6 (Financeiro das duas unidades) — concluído em 12/10/2026

Referência: `CHECKLIST_DESENVOLVIMENTO.md`, seções 2.1 (Financeiro), 4.7, 5 (RN-007, 008, 011, 014) e 6.2.
Pranchas lidas antes de codar (lição 10): `AdmFinanceiro`, `AdmLabFinanceiro`, `AdmLabExtrato`, `MobileFinanceiro`
(`AdmExtratoProfissional` também foi lida; pertence ao "Relatório geral" da clínica — M7).

## Passos
1. [x] Migration: `categorias_financeiras`, `lancamentos`, `lancamento_baixas`, `caixas_diarios` (RN-011 por trigger)
2. [x] Backend `modules/financeiro`: fluxo de caixa, lançamentos (parcelas, recorrência, baixa, cancelamento), contas a receber/pagar, caixa do dia, extrato por cliente, recibo e extrato em PDF
3. [x] Títulos automáticos: OS concluída, plano aprovado, entrada de estoque
4. [x] Contrato OpenAPI + `tests/m6.test.js` (20) — suíte completa: 163 verdes (rodada duas vezes seguidas)
5. [x] Seed `06_financeiro_dev.js`
6. [x] Front: `/admin/clinica/financeiro` e `/admin/lab/financeiro` (uma página, abas por unidade) + celular
7. [x] Navegador em 1280, 1440 e 375 px (lição 13): clínica — lançamento parcelado, fechar caixa, pagamento recusado (RN-011), reabrir; laboratório — fluxo, a receber, preços, extrato
8. [x] Checklist atualizado; Vitest 53 verdes; build de produção ok

## Não exercitado no navegador (coberto por teste de API)
- Download do recibo e do extrato em PDF; baixa parcial; cancelamento; lançamento recorrente
- "Lançar a compra no financeiro" na entrada de estoque; título gerado ao concluir OS e ao aprovar plano

## Fora do M6
- Comissões e Carnê-Leão (Desejável); abas "Transações" e "Comissões"; "Exportar"; XLSX e envio do extrato por e-mail
- Estorno de baixa; período livre no fluxo de caixa; parcelar o título do plano de tratamento
- OS concluídas antes do M6 não têm título (só as novas geram)
- Próximo marco: M7 (relatórios), que inclui o extrato por profissional da clínica e o relatório de OS do laboratório

## Pendências herdadas
- [ ] Alinhamento ao protótipo: Anamnese, Procedimentos, Usuários (deixaram de estar quebrados, mas não seguem as pranchas)
- [ ] Decisões do usuário: tela para o dentista ver/cancelar as OS que gerou; "Agendar prova/instalação"; divergências protótipo × regras listadas em 11/10/2026
- [ ] Exportação xlsx por link; rotação de chave; backup de `anexos_data`; Playwright

## Observações
- Testes rodam no container (`docker compose exec -T api npx jest --runInBand --forceExit`) contra `quickodonto_test`.
- Seed de dev: usuários `*@quickodonto.test`; senha em `seeds/01_usuarios_dev.js` (só dev).
