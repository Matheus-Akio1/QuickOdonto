import { createContext } from 'react';

export type TipoToast = 'info' | 'ok' | 'erro';
export interface ContextoToast {
  avisar: (mensagem: string, tipo?: TipoToast) => void;
}

export const ToastContext = createContext<ContextoToast>({ avisar: () => {} });
