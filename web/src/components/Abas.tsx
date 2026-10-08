interface Aba {
  id: string;
  rotulo: string;
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
    <div className="tabs" role="tablist">
      {abas.map((a) => (
        <button
          key={a.id}
          role="tab"
          className="tab"
          aria-selected={a.id === ativa}
          onClick={() => onMudar(a.id)}
        >
          {a.rotulo}
        </button>
      ))}
    </div>
  );
}
