import { useEffect, useRef, type ReactNode } from 'react';
import { Button } from './Button';

interface Props {
  titulo: string;
  descricao?: string;
  onFechar: () => void;
  children: ReactNode;
  rodape?: ReactNode;
  tipo?: 'modal' | 'drawer';
  largo?: boolean;
}

const FOCAVEIS =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** Modal ou drawer acessível: foco preso dentro, Esc fecha, foco volta a quem abriu. */
export function Overlay({
  titulo,
  descricao,
  onFechar,
  children,
  rodape,
  tipo = 'modal',
  largo,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const fecharRef = useRef(onFechar);
  fecharRef.current = onFechar;

  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null;
    const caixa = ref.current;
    const primeiro = caixa?.querySelector<HTMLElement>(
      '.dialog-body input, .drawer-body input, .dialog-body select, .drawer-body select, .dialog-body textarea, .drawer-body textarea',
    );
    (primeiro ?? caixa?.querySelector<HTMLElement>(FOCAVEIS))?.focus();

    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        fecharRef.current();
      }
      if (e.key !== 'Tab' || !caixa) return;
      const itens = Array.from(caixa.querySelectorAll<HTMLElement>(FOCAVEIS));
      if (!itens.length) return;
      const [a, z] = [itens[0], itens[itens.length - 1]];
      if (e.shiftKey && document.activeElement === a) {
        e.preventDefault();
        z.focus();
      } else if (!e.shiftKey && document.activeElement === z) {
        e.preventDefault();
        a.focus();
      }
    };
    document.addEventListener('keydown', aoTeclar);
    return () => {
      document.removeEventListener('keydown', aoTeclar);
      anterior?.focus?.();
    };
  }, []);

  const drawer = tipo === 'drawer';
  const prefixo = drawer ? 'drawer' : 'dialog';
  return (
    <div
      className={`overlay ${drawer ? 'drawer-wrap' : ''}`}
      onMouseDown={(e) => e.target === e.currentTarget && onFechar()}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className={`${prefixo} ${largo ? 'wide' : ''}`}
      >
        <div className={`${prefixo}-head`}>
          <div>
            <h2>{titulo}</h2>
            {descricao && <p className="muted">{descricao}</p>}
          </div>
          <Button variante="ghost" className="btn-icon" onClick={onFechar} aria-label="Fechar">
            ✕
          </Button>
        </div>
        <div className={`${prefixo}-body`}>{children}</div>
        {rodape && <div className={`${prefixo}-foot`}>{rodape}</div>}
      </div>
    </div>
  );
}
