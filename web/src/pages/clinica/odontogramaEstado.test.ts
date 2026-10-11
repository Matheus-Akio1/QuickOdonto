import { describe, expect, it } from 'vitest';
import type { ProcedimentoPaciente } from '../../api/types';
import { estadoPorDente } from './odontogramaEstado';

const proc = (
  dente: number | null,
  status: ProcedimentoPaciente['status'],
  especialidade: string | null = 'Dentística',
): ProcedimentoPaciente =>
  ({
    id: `${dente}-${status}-${especialidade}`,
    dente,
    status,
    faces: [],
    catalogo: { id: 'c', codigo: 'X', nome: 'Proc', especialidade },
    adendos: [],
  }) as unknown as ProcedimentoPaciente;

describe('situação do dente no odontograma', () => {
  it('concluído vira realizado; planejado ou em andamento vira planejado', () => {
    const e = estadoPorDente([
      proc(16, 'concluido'),
      proc(24, 'planejado'),
      proc(25, 'em_andamento'),
    ]);
    expect(e[16].situacao).toBe('realizado');
    expect(e[24].situacao).toBe('planejado');
    expect(e[25].situacao).toBe('planejado');
  });

  it('o que está em aberto aparece antes do que já foi feito', () => {
    const e = estadoPorDente([proc(16, 'concluido'), proc(16, 'planejado')]);
    expect(e[16].situacao).toBe('planejado');
    expect(e[16].principal?.status).toBe('planejado');
    expect(e[16].procedimentos).toHaveLength(2);
  });

  it('prótese tem cor própria, em qualquer etapa', () => {
    const e = estadoPorDente([
      proc(46, 'em_andamento', 'Prótese'),
      proc(47, 'concluido', 'Prótese'),
    ]);
    expect(e[46].situacao).toBe('protese');
    expect(e[47].situacao).toBe('protese');
  });

  it('cancelados não pintam o dente, mas ficam no histórico; procedimento geral não entra', () => {
    const e = estadoPorDente([proc(11, 'cancelado'), proc(null, 'concluido')]);
    expect(e[11].situacao).toBeNull();
    expect(e[11].procedimentos).toHaveLength(1);
    expect(Object.keys(e)).toEqual(['11']);
  });
});
