import { dataDe, fmtHora, inicioDaSemana, isoLocal, minutosDoDia, somarDias } from './datas';

describe('datas em horário de Brasília', () => {
  it('converte instante ↔ hora local, independente do fuso do navegador', () => {
    const iso = isoLocal('2027-03-10', '08:30');
    expect(new Date(iso).toISOString()).toBe('2027-03-10T11:30:00.000Z');
    expect(fmtHora(iso)).toBe('08:30');
    expect(minutosDoDia(iso)).toBe(510);
    expect(dataDe('2027-03-10T01:00:00.000Z')).toBe('2027-03-09');
  });

  it('calcula semanas começando na segunda', () => {
    expect(inicioDaSemana('2026-10-07')).toBe('2026-10-05'); // quarta
    expect(inicioDaSemana('2026-10-11')).toBe('2026-10-05'); // domingo
    expect(inicioDaSemana('2026-10-05')).toBe('2026-10-05');
    expect(somarDias('2026-10-31', 1)).toBe('2026-11-01');
    expect(somarDias('2026-03-01', -1)).toBe('2026-02-28');
  });
});
