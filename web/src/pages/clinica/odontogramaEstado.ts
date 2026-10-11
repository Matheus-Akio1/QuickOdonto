import type { Face, ProcedimentoPaciente } from '../../api/types';
import type { EstadoFace } from './Dente';

const PRIORIDADE: Record<string, number> = { em_andamento: 3, planejado: 2, concluido: 1 };
const maisRelevante = (a: EstadoFace | undefined, b: EstadoFace): EstadoFace =>
  !a || (b && PRIORIDADE[b] > PRIORIDADE[a]) ? b : a;

export interface EstadoDente {
  faces: Partial<Record<Face, EstadoFace>>;
  inteiro: EstadoFace | null;
  procedimentos: ProcedimentoPaciente[];
}

/**
 * Situação por dente e por face a partir dos procedimentos (cancelados não contam).
 * Em andamento > planejado > concluído — o que exige atenção aparece primeiro.
 */
export function estadoPorDente(procs: ProcedimentoPaciente[]): Record<number, EstadoDente> {
  const mapa: Record<number, EstadoDente> = {};
  for (const p of procs) {
    if (!p.dente) continue;
    const d = (mapa[p.dente] ??= { faces: {}, inteiro: null, procedimentos: [] });
    d.procedimentos.push(p);
    if (p.status === 'cancelado') continue;
    if (p.faces.length === 0) d.inteiro = maisRelevante(d.inteiro ?? undefined, p.status);
    for (const f of p.faces) d.faces[f] = maisRelevante(d.faces[f], p.status);
  }
  return mapa;
}
