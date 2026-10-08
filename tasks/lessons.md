# Lições aprendidas

> Reler no início de cada sessão. Toda correção apontada pelo usuário vira regra aqui no mesmo turno.

---

## 1. Edição por script que não casa falha em silêncio
- **O que houve:** no M1 apliquei, via script, a inclusão do `csrfToken` em `GET /auth/me`. O Prettier já tinha reformatado o trecho, o `replace` não casou, nada foi gravado e eu relatei como feito. Só apareceu quando o front real tentou salvar um paciente (403 CSRF).
- **Regra:** depois de qualquer edição por script (`replace`), conferir que ela entrou (`grep` ou ler o trecho) — usar `assert old in texto` no próprio script. Preferir a ferramenta `Edit` para mudanças pontuais.
- **Regra:** todo campo que o front usa para se restaurar (ex.: `csrfToken` do `/me`) precisa de teste de contrato na API, não só “responde 200”.

## 2. Teste de API não substitui o fluxo real na tela
- **O que houve:** 70 testes do backend passavam e ainda assim faltava o CSRF no `/me`. O defeito só apareceu rodando login → recarregar → salvar no navegador.
- **Regra:** um marco só vira “validado” depois de percorrer o fluxo na interface real (navegador) e conferir o console/rede, além dos testes automatizados.

## 3. Ambiente de teste do front
- `openapi-fetch` captura o `fetch` global ao importar: para testar o cliente, usar `vi.stubGlobal('fetch')` **antes** de importar (`vi.resetModules()` + `import()` dinâmico); para testar componentes, mockar o módulo `api/client`.
- No Node a base `/api/v1` é relativa e não vira `Request`: `src/test/setup.ts` define `VITE_API_URL` absoluta.
- Dependência nova do front: o `Dockerfile` precisa copiar o `.npmrc` (`legacy-peer-deps`) antes do `npm install`, e o container sobe com `docker compose up -d --build -V --force-recreate web`.
