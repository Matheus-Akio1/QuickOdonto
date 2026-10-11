import type { ProcedimentoPaciente } from '../../api/types';
import { estadoPorDente } from './odontogramaEstado';

const proc = (p: Partial<ProcedimentoPaciente>): ProcedimentoPaciente => ({
  id: Math.random().toString(),
  paciente_id: 'p',
  catalogo: { id: 'c', codigo: 'X', nome: 'X' },
  dente: 36,
  faces: [],
  status: 'planejado',
  valor: 0,
  adendos: [],
  criado_em: '2026-10-01T00:00:00Z',
  ...p,
});

describe('estado do odontograma', () => {
  it('face mostra o status mais relevante; cancelado não conta', () => {
    const m = estadoPorDente([
      proc({ faces: ['O'], status: 'concluido' }),
      proc({ faces: ['O', 'M'], status: 'planejado' }),
      proc({ faces: ['D'], status: 'cancelado' }),
    ]);
    expect(m[36].faces).toEqual({ O: 'planejado', M: 'planejado' });
    expect(m[36].procedimentos).toHaveLength(3);
  });

  it('procedimento sem face marca o dente inteiro; sem dente é ignorado', () => {
    const m = estadoPorDente([proc({ dente: 11, status: 'em_andamento' }), proc({ dente: null })]);
    expect(m[11].inteiro).toBe('em_andamento');
    expect(Object.keys(m)).toEqual(['11']);
  });
});
