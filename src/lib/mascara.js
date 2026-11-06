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

/** CNPJ: esconde os 2 primeiros e os 2 últimos dígitos (como na prancha dos cadernos). */
function mascararCnpj(cnpj) {
  const d = somenteDigitos(cnpj);
  return d.length === 14 ? `**.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-**` : null;
}

/** Documento do cliente do laboratório: CNPJ ou CPF, sempre mascarado. */
const mascararDocumento = (doc) => mascararCnpj(doc) || mascararCpf(doc);

module.exports = { mascararCpf, mascararCelular, mascararCnpj, mascararDocumento };
