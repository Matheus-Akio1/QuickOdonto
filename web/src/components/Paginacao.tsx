import { Button } from './Button';

interface Props {
  pagina: number;
  limite: number;
  total: number;
  onMudar: (pagina: number) => void;
}

export function Paginacao({ pagina, limite, total, onMudar }: Props) {
  const ultima = Math.max(1, Math.ceil(total / limite));
  if (total <= limite) return <div className="pagination">{total} registro(s)</div>;
  return (
    <nav className="pagination" aria-label="Paginação">
      <span>
        Página {pagina} de {ultima} · {total} registros
      </span>
      <div className="row">
        <Button
          variante="secondary"
          pequeno
          disabled={pagina <= 1}
          onClick={() => onMudar(pagina - 1)}
        >
          Anterior
        </Button>
        <Button
          variante="secondary"
          pequeno
          disabled={pagina >= ultima}
          onClick={() => onMudar(pagina + 1)}
        >
          Próxima
        </Button>
      </div>
    </nav>
  );
}
