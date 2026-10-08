import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { ToastContext, type TipoToast } from './context';

interface Item {
  id: number;
  mensagem: string;
  tipo: TipoToast;
}

let contador = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [itens, setItens] = useState<Item[]>([]);

  const avisar = useCallback((mensagem: string, tipo: TipoToast = 'info') => {
    const id = (contador += 1);
    setItens((atual) => [...atual, { id, mensagem, tipo }]);
    setTimeout(
      () => setItens((atual) => atual.filter((i) => i.id !== id)),
      tipo === 'erro' ? 7000 : 4000,
    );
  }, []);

  const valor = useMemo(() => ({ avisar }), [avisar]);
  return (
    <ToastContext.Provider value={valor}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {itens.map((i) => (
          <div key={i.id} className={`toast ${i.tipo === 'info' ? '' : i.tipo}`}>
            {i.mensagem}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
