/**
 * A clínica opera em horário de Brasília (UTC-3, sem horário de verão) — mesma premissa do backend.
 * Datas de calendário trafegam como 'AAAA-MM-DD'; instantes como ISO 8601 com fuso.
 */
const OFFSET_MS = -3 * 3600000;
const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const DIAS_LONGOS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

const local = (iso: string | number | Date) => new Date(new Date(iso).getTime() + OFFSET_MS);
const doisDigitos = (n: number) => String(n).padStart(2, '0');

export const hoje = (): string => local(Date.now()).toISOString().slice(0, 10);

/** Minutos desde 00:00 (horário de Brasília) de um instante. */
export function minutosDoDia(iso: string): number {
  const d = local(iso);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

/** Data 'AAAA-MM-DD' (Brasília) de um instante. */
export const dataDe = (iso: string): string => local(iso).toISOString().slice(0, 10);

export const hhmm = (min: number): string =>
  `${doisDigitos(Math.floor(min / 60))}:${doisDigitos(min % 60)}`;
export const fmtHora = (iso: string): string => hhmm(minutosDoDia(iso));

export function somarDias(data: string, dias: number): string {
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export const diaDaSemana = (data: string): number => new Date(`${data}T12:00:00Z`).getUTCDay();

/** Segunda-feira da semana que contém a data. */
export function inicioDaSemana(data: string): string {
  const dow = diaDaSemana(data);
  return somarDias(data, dow === 0 ? -6 : 1 - dow);
}

export const fmtDataBR = (data: string): string => data.split('-').reverse().join('/');
export const fmtDataCurta = (data: string): string => `${data.slice(8, 10)}/${data.slice(5, 7)}`;
export const nomeDia = (data: string): string => DIAS[diaDaSemana(data)];
export const nomeDiaLongo = (data: string): string => DIAS_LONGOS[diaDaSemana(data)];

/** Monta o instante ISO (com fuso de Brasília) de uma data e um horário 'HH:MM'. */
export const isoLocal = (data: string, hora: string): string => `${data}T${hora}:00-03:00`;

export const fmtDataHora = (iso: string): string => `${fmtDataBR(dataDe(iso))} às ${fmtHora(iso)}`;

export function fmtDataHoraCompleta(iso: string | null | undefined): string {
  if (!iso) return '—';
  return fmtDataHora(iso);
}

const MESES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

/** "14 – 20 de setembro de 2026" (ou "28 de set. – 4 de out. de 2026" quando cruza o mês). */
export function fmtPeriodo(inicio: string, fim: string): string {
  const [ai, mi, di] = inicio.split('-').map(Number);
  const [af, mf, df] = fim.split('-').map(Number);
  if (ai === af && mi === mf) return `${di} – ${df} de ${MESES[mi - 1]} de ${ai}`;
  return `${di} de ${MESES[mi - 1].slice(0, 3)}. – ${df} de ${MESES[mf - 1].slice(0, 3)}. de ${af}`;
}

/** "Quarta, 16 de setembro" */
export function fmtDiaExtenso(data: string): string {
  const [, m, d] = data.split('-').map(Number);
  return `${nomeDiaLongo(data)}, ${d} de ${MESES[m - 1]}`;
}

/** Minutos desde 00:00 (Brasília) do instante atual. */
export const agoraEmMinutos = (): number => minutosDoDia(new Date().toISOString());

/** Tempo decorrido desde um instante: "6 min", "1h06". */
export function fmtDecorrido(iso: string, agora = Date.now()): string {
  const min = Math.max(0, Math.floor((agora - new Date(iso).getTime()) / 60000));
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`;
}

/** Duração em minutos por extenso curto: "30 min", "2 h", "1 h 30". */
export function fmtDuracao(min: number): string {
  if (min < 60) return `${min} min`;
  return min % 60 ? `${Math.floor(min / 60)} h ${min % 60}` : `${min / 60} h`;
}
