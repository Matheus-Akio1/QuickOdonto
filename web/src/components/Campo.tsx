import { useId, type ReactNode } from 'react';

interface PropsCampo {
  id: string;
  'aria-invalid': boolean;
  'aria-describedby'?: string;
}

interface Props {
  label: string;
  erro?: string;
  dica?: string;
  className?: string;
  children: (props: PropsCampo) => ReactNode;
}

/** Rótulo real + mensagem de erro/dica ligados ao controle por id/aria (acessibilidade). */
export function Campo({ label, erro, dica, className = '', children }: Props) {
  const id = useId();
  const descId = `${id}-desc`;
  const temDesc = Boolean(erro || dica);
  return (
    <div className={`field ${className}`}>
      <label htmlFor={id}>{label}</label>
      {children({
        id,
        'aria-invalid': Boolean(erro),
        'aria-describedby': temDesc ? descId : undefined,
      })}
      {temDesc && (
        <span id={descId} className={erro ? 'error' : 'hint'} role={erro ? 'alert' : undefined}>
          {erro ?? dica}
        </span>
      )}
    </div>
  );
}
