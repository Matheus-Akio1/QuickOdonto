const { z } = require('zod');

/** Valida com zod; em caso de erro responde 400 (mensagem do primeiro problema) e devolve null. */
function validar(schema, dados, res) {
  const r = schema.safeParse(dados);
  if (!r.success) {
    const i = r.error.issues[0];
    res.status(400).json({ erro: `${i.path.length ? `${i.path.join('.')}: ` : ''}${i.message}` });
    return null;
  }
  return r.data;
}

/** UUID inválido em :id vira 404 (não vaza se o recurso existe). */
function uuidOu404(valor, res, mensagem) {
  if (z.string().uuid().safeParse(valor).success) return true;
  res.status(404).json({ erro: mensagem });
  return false;
}

const dataHora = z.iso.datetime({
  offset: true,
  message: 'Data/hora inválida (use ISO 8601 com fuso).',
});

module.exports = { validar, uuidOu404, dataHora };
