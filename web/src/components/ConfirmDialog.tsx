import type { ReactNode } from 'react';
import { Button } from './Button';
import { Overlay } from './Overlay';

interface Props {
  titulo: string;
  children: ReactNode;
  confirmar: string;
  perigo?: boolean;
  carregando?: boolean;
  onConfirmar: () => void;
  onCancelar: () => void;
}

export function ConfirmDialog({
  titulo,
  children,
  confirmar,
  perigo,
  carregando,
  onConfirmar,
  onCancelar,
}: Props) {
  return (
    <Overlay
      titulo={titulo}
      onFechar={onCancelar}
      rodape={
        <>
          <Button variante="secondary" onClick={onCancelar}>
            Voltar
          </Button>
          <Button
            variante={perigo ? 'danger' : 'primary'}
            carregando={carregando}
            onClick={onConfirmar}
          >
            {confirmar}
          </Button>
        </>
      }
    >
      <div>{children}</div>
    </Overlay>
  );
}
