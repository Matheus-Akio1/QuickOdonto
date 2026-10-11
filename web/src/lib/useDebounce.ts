import { useEffect, useState } from 'react';

/** Devolve o valor só depois de `ms` sem mudanças — evita uma requisição por tecla. */
export function useDebounce<T>(valor: T, ms: number): T {
  const [estavel, setEstavel] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setEstavel(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);
  return estavel;
}
