import { useEffect, useState } from 'react';

/** true enquanto a consulta de mídia casar (ex.: '(max-width: 767px)'). */
export function useMedia(consulta: string): boolean {
  const [casa, setCasa] = useState(() => window.matchMedia(consulta).matches);
  useEffect(() => {
    const mq = window.matchMedia(consulta);
    const ouvir = () => setCasa(mq.matches);
    ouvir();
    mq.addEventListener('change', ouvir);
    return () => mq.removeEventListener('change', ouvir);
  }, [consulta]);
  return casa;
}

/** true abaixo de 768px — o mesmo corte em que o menu lateral vira barra inferior. */
export const useCelular = (): boolean => useMedia('(max-width: 767px)');
