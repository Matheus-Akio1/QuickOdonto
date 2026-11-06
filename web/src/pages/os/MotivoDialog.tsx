import { useState } from 'react';
import { Button } from '../../components/Button';
import { Campo } from '../../components/Campo';
import { Overlay } from '../../components/Overlay';

interface Props {
  titulo: string;
  descricao?: string;
  rotulo: string;
  confirmar: string;
  perigo?: boolean;
  carregando?: boolean;
  onConfirmar: (motivo: string) => void;
  onFechar: () => void;
}

/** Diálogo de uma pergunta só: cancelamento, refação e ajuste de prova pedem um motivo. */
export function MotivoDialog({
  titulo,
  descricao,
  rotulo,
  confirmar,
  perigo,
  carregando,
  onConfirmar,
  onFechar,
}: Props) {
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState<string>();
  const enviar = () => {
    const m = motivo.trim();
    if (m.length < 3) {
      setErro('Informe o motivo (mín. 3 caracteres).');
      return;
    }
    onConfirmar(m);
  };
  return (
    <Overlay
      titulo={titulo}
      descricao={descricao}
      onFechar={onFechar}
      rodape={
        <>
          <Button variante="secondary" onClick={onFechar}>
            Voltar
          </Button>
          <Button variante={perigo ? 'danger' : 'primary'} carregando={carregando} onClick={enviar}>
            {confirmar}
          </Button>
        </>
      }
    >
      <Campo label={rotulo} erro={erro}>
        {(p) => (
          <textarea
            {...p}
            className="textarea"
            maxLength={300}
            value={motivo}
            onChange={(e) => {
              setMotivo(e.target.value);
              setErro(undefined);
            }}
          />
        )}
      </Campo>
    </Overlay>
  );
}
