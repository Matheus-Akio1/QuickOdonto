/**
 * A clínica opera em horário de Brasília (UTC-3, sem horário de verão desde 2019).
 * Datas vão e voltam do banco em timestamptz; a jornada é avaliada em hora local.
 */
const OFFSET_HORAS = -3;
const OFFSET_TEXTO = '-03:00';

/** Decompõe um instante em partes locais: { data:'YYYY-MM-DD', dow:0-6, minutos:0-1439 }. */
function parteLocal(instante) {
  const l = new Date(new Date(instante).getTime() + OFFSET_HORAS * 3600000);
  return {
    data: l.toISOString().slice(0, 10),
    dow: l.getUTCDay(),
    minutos: l.getUTCHours() * 60 + l.getUTCMinutes(),
  };
}

const paraMinutos = (hhmm) => {
  const [h, m] = String(hhmm).split(':');
  return Number(h) * 60 + Number(m);
};

const paraHHMM = (min) =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/** Instante (Date) de 'YYYY-MM-DD' + minutos do dia em hora local. */
const instanteLocal = (data, minutos) => new Date(`${data}T${paraHHMM(minutos)}:00${OFFSET_TEXTO}`);

module.exports = { parteLocal, paraMinutos, paraHHMM, instanteLocal };
