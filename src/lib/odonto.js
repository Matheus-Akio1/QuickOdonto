/** Notação FDI: permanentes 11–18, 21–28, 31–38, 41–48; decíduos 51–55, 61–65, 71–75, 81–85. */
const DENTES = new Set();
for (const [quadrantes, ultimo] of [
  [[1, 2, 3, 4], 8],
  [[5, 6, 7, 8], 5],
]) {
  for (const q of quadrantes) for (let d = 1; d <= ultimo; d += 1) DENTES.add(q * 10 + d);
}

/** Faces: Vestibular, Lingual/palatina, Mesial, Distal, Oclusal, Incisal. */
const FACES = ['V', 'L', 'M', 'D', 'O', 'I'];

const denteValido = (n) => DENTES.has(Number(n));

module.exports = { DENTES, FACES, denteValido };
