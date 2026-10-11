import { IconeSetaDireita, IconeSetaEsquerda } from './Icones';

interface Props {
  pagina: number;
  limite: number;
  total: number;
  onMudar: (pagina: number) => void;
  /** Substantivo no plural para "Mostrando 1–8 de 248 pacientes". */
  nome?: string;
}

function paginas(atual: number, ultima: number): (number | '…')[] {
  if (ultima <= 7) return Array.from({ length: ultima }, (_, i) => i + 1);
  const meio = [atual - 1, atual, atual + 1].filter((n) => n > 1 && n < ultima);
  return [
    1,
    ...(meio[0] > 2 ? ['…' as const] : []),
    ...meio,
    ...(meio[meio.length - 1] < ultima - 1 ? ['…' as const] : []),
    ultima,
  ];
}

export function Paginacao({ pagina, limite, total, onMudar, nome = 'registros' }: Props) {
  const ultima = Math.max(1, Math.ceil(total / limite));
  const de = total === 0 ? 0 : (pagina - 1) * limite + 1;
  const ate = Math.min(pagina * limite, total);
  return (
    <nav className="pagination" aria-label="Paginação">
      <span>
        Mostrando{' '}
        <b style={{ color: 'var(--ink)' }}>
          {de}–{ate}
        </b>{' '}
        de <b style={{ color: 'var(--ink)' }}>{total}</b> {nome}
      </span>
      {ultima > 1 && (
        <div className="row" style={{ gap: 2 }}>
          <button
            className="pag-num"
            aria-label="Página anterior"
            disabled={pagina <= 1}
            onClick={() => onMudar(pagina - 1)}
          >
            <IconeSetaEsquerda tamanho={16} />
          </button>
          {paginas(pagina, ultima).map((p, i) =>
            p === '…' ? (
              <span key={`r${i}`} style={{ padding: '0 6px' }}>
                …
              </span>
            ) : (
              <button
                key={p}
                className="pag-num"
                aria-current={p === pagina ? 'page' : undefined}
                onClick={() => onMudar(p)}
              >
                {p}
              </button>
            ),
          )}
          <button
            className="pag-num"
            aria-label="Próxima página"
            disabled={pagina >= ultima}
            onClick={() => onMudar(pagina + 1)}
          >
            <IconeSetaDireita tamanho={16} />
          </button>
        </div>
      )}
    </nav>
  );
}
