import type { ReactNode } from 'react';

interface Aba {
  id: string;
  rotulo: ReactNode;
}

export function Abas({
  abas,
  ativa,
  onMudar,
}: {
  abas: Aba[];
  ativa: string;
  onMudar: (id: string) => void;
}) {
  return (
    <div className="tabs" role="tablist" style={{ overflowX: 'auto' }}>
      {abas.map((a) => (
        <button
          key={a.id}
          type="button"
          role="tab"
          className={`tab ${a.id === ativa ? 'on' : ''}`}
          style={{
            background: 'none',
            border: 0,
            borderBottom: '2px solid transparent',
            whiteSpace: 'nowrap',
          }}
          aria-selected={a.id === ativa}
          onClick={() => onMudar(a.id)}
        >
          {a.rotulo}
        </button>
      ))}
    </div>
  );
}
