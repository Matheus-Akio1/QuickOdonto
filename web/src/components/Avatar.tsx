import { iniciais, tomDoNome } from '../lib/pessoa';

interface Props {
  nome: string;
  tamanho?: number;
  tom?: '' | 'c' | 'i' | 's';
}

/** Avatar com iniciais (.av); o tom vem do nome, então a mesma pessoa tem sempre a mesma cor. */
export function Avatar({ nome, tamanho = 38, tom }: Props) {
  return (
    <div
      className={`av ${tom ?? tomDoNome(nome)}`}
      style={{ width: tamanho, height: tamanho }}
      aria-hidden="true"
    >
      {iniciais(nome)}
    </div>
  );
}
