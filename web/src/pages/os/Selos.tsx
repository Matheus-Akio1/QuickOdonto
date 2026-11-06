import type { EtapaProducao } from '../../api/types';
import { IconeAlerta } from '../../components/Icones';
import { PRODUCAO, type Selo as DadosSelo } from '../../lib/os';

export function Selo({ selo, pequeno }: { selo: DadosSelo; pequeno?: boolean }) {
  return (
    <span className={`badge ${selo.classe} ${pequeno ? 'selo-sm' : ''}`}>
      {selo.alerta && <IconeAlerta tamanho={13} />}
      {selo.texto}
    </span>
  );
}

export function EtapaProducaoTag({ etapa }: { etapa: EtapaProducao | null | undefined }) {
  if (!etapa) return <span className="muted">—</span>;
  const e = PRODUCAO[etapa];
  return (
    <span className="os-etapa">
      <i style={{ background: e.ponto }} />
      {e.titulo}
    </span>
  );
}

export function OrigemTag({ tipo }: { tipo: 'interno' | 'externo' }) {
  return tipo === 'interno' ? (
    <span className="badge b-own">Clínica própria</span>
  ) : (
    <span className="badge b-lab">Externa</span>
  );
}
