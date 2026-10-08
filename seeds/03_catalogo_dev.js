/** Seed de DESENVOLVIMENTO: catálogo básico de procedimentos (valores ilustrativos). */
const CATALOGO = [
  ['AVAL', 'Consulta de avaliação', 'Clínico geral', 30, 120],
  ['PROF', 'Profilaxia (limpeza)', 'Periodontia', 40, 180],
  ['FLUO', 'Aplicação tópica de flúor', 'Odontopediatria', 15, 60],
  ['SELA', 'Selante (por dente)', 'Odontopediatria', 20, 90],
  ['REST1', 'Restauração em resina — 1 face', 'Dentística', 40, 220],
  ['REST2', 'Restauração em resina — 2 faces', 'Dentística', 50, 280],
  ['EXOS', 'Extração simples', 'Cirurgia', 40, 250],
  ['ENDO1', 'Tratamento de canal — unirradicular', 'Endodontia', 90, 750],
  ['RASP', 'Raspagem por sextante', 'Periodontia', 30, 160],
  ['RXPA', 'Radiografia periapical', 'Radiologia', 10, 40],
  ['COROA', 'Coroa em porcelana', 'Prótese', 60, 1600],
  ['CLAR', 'Clareamento de consultório', 'Dentística', 60, 900],
];

exports.seed = async (knex) => {
  for (const [codigo, nome, especialidade, duracao_min, valor_padrao] of CATALOGO) {
    await knex('procedimentos_catalogo')
      .insert({ codigo, nome, especialidade, duracao_min, valor_padrao })
      .onConflict('codigo')
      .ignore();
  }
};
