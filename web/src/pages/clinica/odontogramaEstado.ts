import type { ProcedimentoPaciente } from '../../api/types';
import type { Situacao } from '../../lib/odonto';

export interface EstadoDente {
  situacao: Situacao;
  /** Procedimento que explica a situação (o que aparece na barra do dente selecionado). */
  principal: ProcedimentoPaciente | null;
  procedimentos: ProcedimentoPaciente[];
}

const ehProtese = (p: ProcedimentoPaciente) => /pr[oó]tese/i.test(p.catalogo.especialidade ?? '');
const pendente = (p: ProcedimentoPaciente) =>
  p.status === 'planejado' || p.status === 'em_andamento';

/**
 * Situação por dente a partir dos procedimentos (cancelados não contam).
 * Prótese > planejado/em andamento > realizado — a mesma ordem de leitura da legenda do protótipo.
 */
export function estadoPorDente(procs: ProcedimentoPaciente[]): Record<number, EstadoDente> {
  const mapa: Record<number, EstadoDente> = {};
  for (const p of procs) {
    if (!p.dente) continue;
    (mapa[p.dente] ??= { situacao: null, principal: null, procedimentos: [] }).procedimentos.push(
      p,
    );
  }
  for (const d of Object.values(mapa)) {
    const vivos = d.procedimentos.filter((p) => p.status !== 'cancelado');
    const protese = vivos.find(ehProtese);
    const aberto = vivos.find(pendente);
    d.principal = protese ?? aberto ?? vivos[0] ?? null;
    d.situacao = protese ? 'protese' : aberto ? 'planejado' : vivos.length ? 'realizado' : null;
  }
  return mapa;
}
