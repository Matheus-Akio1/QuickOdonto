export interface Intervalo {
  inicio: number; // minutos desde 00:00
  fim: number;
}

export interface Posicionado<T> {
  item: T;
  faixa: number;
  faixas: number;
}

/**
 * Distribui itens sobrepostos em faixas lado a lado (como a agenda do Google): itens que se tocam
 * formam um grupo e dividem a largura; itens isolados ocupam a largura toda.
 */
export function distribuirEmFaixas<T extends Intervalo>(itens: T[]): Posicionado<T>[] {
  const ordenados = [...itens].sort((a, b) => a.inicio - b.inicio || a.fim - b.fim);
  const saida: Posicionado<T>[] = [];
  let grupo: Posicionado<T>[] = [];
  let fimGrupo = -1;
  let fimPorFaixa: number[] = [];

  const fecharGrupo = () => {
    grupo.forEach((g) => {
      g.faixas = fimPorFaixa.length;
    });
    saida.push(...grupo);
    grupo = [];
    fimPorFaixa = [];
    fimGrupo = -1;
  };

  for (const item of ordenados) {
    if (grupo.length && item.inicio >= fimGrupo) fecharGrupo();
    let faixa = fimPorFaixa.findIndex((fim) => fim <= item.inicio);
    if (faixa === -1) {
      faixa = fimPorFaixa.length;
      fimPorFaixa.push(item.fim);
    } else {
      fimPorFaixa[faixa] = item.fim;
    }
    grupo.push({ item, faixa, faixas: 1 });
    fimGrupo = Math.max(fimGrupo, item.fim);
  }
  fecharGrupo();
  return saida;
}

/** Trechos de [de, ate] NÃO cobertos pelas janelas (usado para hachurar fora da jornada). */
export function lacunas(janelas: Intervalo[], de: number, ate: number): Intervalo[] {
  const ord = [...janelas].sort((a, b) => a.inicio - b.inicio);
  const saida: Intervalo[] = [];
  let cursor = de;
  for (const j of ord) {
    if (j.inicio > cursor) saida.push({ inicio: cursor, fim: Math.min(j.inicio, ate) });
    cursor = Math.max(cursor, j.fim);
    if (cursor >= ate) break;
  }
  if (cursor < ate) saida.push({ inicio: cursor, fim: ate });
  return saida.filter((l) => l.fim > l.inicio);
}
