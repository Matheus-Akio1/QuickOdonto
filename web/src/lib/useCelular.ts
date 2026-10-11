import { useEffect, useState } from 'react';

const CONSULTA = '(max-width: 767px)';

/** true abaixo de 768px — o mesmo corte em que o menu lateral vira barra inferior. */
export function useCelular(): boolean {
  const [celular, setCelular] = useState(() => window.matchMedia(CONSULTA).matches);
  useEffect(() => {
    const mq = window.matchMedia(CONSULTA);
    const ouvir = () => setCelular(mq.matches);
    mq.addEventListener('change', ouvir);
    return () => mq.removeEventListener('change', ouvir);
  }, []);
  return celular;
}
