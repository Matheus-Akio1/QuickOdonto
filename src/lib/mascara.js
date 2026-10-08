const { somenteDigitos } = require('./validacoes');

/** Mascaramento padrão na API (seção 3.1): só os 2 últimos dígitos do CPF. */
function mascararCpf(cpf) {
  const d = somenteDigitos(cpf);
  return d.length === 11 ? `***.***.***-${d.slice(9)}` : null;
}

/** Celular: DDD e 4 últimos dígitos. */
function mascararCelular(cel) {
  const d = somenteDigitos(cel);
  if (d.length < 10) return null;
  return `(${d.slice(0, 2)}) *****-${d.slice(-4)}`;
}

module.exports = { mascararCpf, mascararCelular };
