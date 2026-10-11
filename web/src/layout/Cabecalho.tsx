import type { ReactNode } from 'react';
import { Notificacoes } from './Notificacoes';

interface Props {
  trilha: string;
  titulo: string;
  children?: ReactNode;
}

/** Cabeçalho de página do protótipo (.top): trilha + título à esquerda; busca, ações e sino à direita. */
export function Cabecalho({ trilha, titulo, children }: Props) {
  return (
    <header className="top">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flexGrow: 1, minWidth: 0 }}>
        <span className="crumb">{trilha}</span>
        <h1 className="h1">{titulo}</h1>
      </div>
      {children}
      <Notificacoes />
    </header>
  );
}

interface BuscaProps {
  valor: string;
  onMudar: (v: string) => void;
  placeholder: string;
  largura?: number;
}

/** Campo de busca do cabeçalho (.search). */
export function BuscaCabecalho({ valor, onMudar, placeholder, largura = 360 }: BuscaProps) {
  return (
    <label className="search" style={{ width: largura, maxWidth: '100%' }}>
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-3.5-3.5" />
      </svg>
      <input
        type="search"
        placeholder={placeholder}
        aria-label={placeholder}
        value={valor}
        onChange={(e) => onMudar(e.target.value)}
      />
    </label>
  );
}
