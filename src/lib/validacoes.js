const somenteDigitos = (v) => String(v ?? '').replace(/\D/g, '');

/** RN-001 — CPF com dígitos verificadores válidos (recusa sequências repetidas). */
function cpfValido(valor) {
  const cpf = somenteDigitos(valor);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const dv = (n) => {
    let soma = 0;
    for (let i = 0; i < n; i += 1) soma += Number(cpf[i]) * (n + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(cpf[9]) && dv(10) === Number(cpf[10]);
}

module.exports = { somenteDigitos, cpfValido };
