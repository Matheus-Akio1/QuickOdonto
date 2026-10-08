import type { ReactNode } from 'react';
import { Button } from './Button';

export function Carregando({ linhas = 4 }: { linhas?: number }) {
  return (
    <div className="stack" role="status" aria-label="Carregando">
      {Array.from({ length: linhas }, (_, i) => (
        <div key={i} className="skeleton" style={{ width: `${95 - i * 9}%` }} />
      ))}
    </div>
  );
}

export function Vazio({ titulo, children }: { titulo: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <h3>{titulo}</h3>
      {children && <p>{children}</p>}
    </div>
  );
}

export function ErroCarga({ erro, onTentar }: { erro: unknown; onTentar?: () => void }) {
  const msg = erro instanceof Error ? erro.message : 'Não foi possível carregar.';
  return (
    <div className="alert" role="alert">
      <div className="row">
        <span>{msg}</span>
        {onTentar && (
          <Button variante="secondary" pequeno onClick={onTentar}>
            Tentar de novo
          </Button>
        )}
      </div>
    </div>
  );
}
