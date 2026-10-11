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

## 4. O `assert` nos scripts de edição funciona — manter
- Na retomada do M4, dois `replace` não casaram por causa da formatação do Prettier; o `assert` parou o script e nada foi aplicado pela metade. Continua valendo a regra 1.

## 5. Uploads: nome de arquivo em UTF-8
- O multer decodifica o nome do arquivo como latin1 por padrão (`"ção"` → `"Ã§Ã£o"`). Sempre configurar `defParamCharset: 'utf8'` e testar com nome acentuado. Só apareceu no fluxo real com arquivo de verdade.

## 6. Ambiente: Docker travado
- Docker Desktop em "unable to start": olhar `df -h /System/Volumes/Data` primeiro (disco cheio derrubou o daemon). Depois de liberar espaço, o `com.docker.backend` antigo fica pendurado: encerrar o processo e reabrir o app. No macOS não há `timeout`; usar `perl -e 'alarm N; exec @ARGV' comando`.
- Limpezas de espaço podem apagar o volume do Postgres de dev: depois de retomar, conferir se as migrations rodaram "do zero" e rodar o seed.

## 7. Layout: `justify-content: center` em conteúdo que transborda corta o início
- No odontograma, os dentes 18/48 ficaram inalcançáveis pela rolagem. Para centralizar algo que pode transbordar: `width: max-content; margin: 0 auto` dentro do contêiner com `overflow-x: auto`. Em grid de uma coluna, usar `minmax(0, 1fr)` (o `1fr` cresce até a largura mínima do conteúdo e empurra a página).

## 8. `now()` é fixo dentro da transação
- Itens inseridos na mesma transação recebiam o mesmo `criado_em` e voltavam em ordem aleatória (desempate por UUID). Quando a ordem de inserção importa, gravar `clock_timestamp()` (ou uma coluna de ordem explícita) e ter teste de ordem.

## 9. Validar com dados realistas
- Nome de arquivo acentuado, imagem real, várias linhas num formulário: foi isso que revelou os bugs do M4 (UTF-8 no upload, ordem dos itens, odontograma cortado). Os testes automatizados usavam dados "limpos" demais.

## 10. Protótipo: consultar ANTES de construir qualquer tela, e validar DEPOIS
- **O que houve:** o front do M1, M2 e M4 foi construído sem olhar o protótipo. Procurei só nos arquivos do projeto, concluí "não está no repositório" e segui com cores e layout inventados. O protótipo existia o tempo todo como canvas de design na conta do usuário no claude.ai ("QuickOdonto — telas melhoradas", 35 pranchas, com o sistema visual). O usuário só percebeu quando pediu para rever as telas.
- **Regra — onde procurar:** quando um documento do projeto cita um insumo (protótipo, URS, planilha) que não está no repositório, procurar também fora dele antes de assumir que não existe: artefatos da conta (`Artifact list`), sessões anteriores, e, se ainda assim não achar, PERGUNTAR ao usuário onde está. Nunca substituir um insumo ausente por invenção sem avisar e sem perguntar.
- **Regra — antes de codar uma tela:** ler a prancha correspondente no canvas vigente (`project/<Tela>.dc.html`) e o sistema visual (`project/Sistema.dc.html`). Anotar no `tasks/todo.md` qual prancha serve de referência para cada tela.
- **Regra — validação obrigatória para marcar `[x]` em tela (seção 6.2):** comparar a tela construída com a prancha, lado a lado, e listar as diferenças: estrutura (blocos, ordem, colunas), textos e rótulos, cores e tipografia do sistema visual, estados (vazio, erro, carregando) e versão mobile. Só marca `[x]` com a comparação feita; divergência proposital fica escrita na linha do checklist com o motivo.
- **Regra — fonte da verdade:** o canvas vigente é "QuickOdonto — telas melhoradas" (confirmado pelo usuário em 11/10/2026). O checklist descreve O QUE existe; o protótipo define COMO aparece. Se os dois divergirem, apontar ao usuário em vez de escolher sozinho.
- **Regra — só leitura:** não publicar nem alterar nada nos canvases do protótipo sem pedido explícito.

