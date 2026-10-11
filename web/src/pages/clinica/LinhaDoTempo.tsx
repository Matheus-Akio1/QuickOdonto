import type { ItemLinhaTempo } from '../../api/types';
import { Vazio } from '../../components/Feedback';
import { fmtDataHora } from '../../lib/datas';
import { TEXTO_STATUS_CONSULTA } from '../../lib/status';

const ROTULO: Record<ItemLinhaTempo['tipo'], string> = {
  evolucao: 'Evolução',
  anamnese: 'Anamnese',
  procedimento: 'Procedimento',
  anexo: 'Anexo',
  consulta: 'Consulta',
};
const ABA: Partial<Record<ItemLinhaTempo['tipo'], string>> = {
  evolucao: 'evolucoes',
  procedimento: 'odontograma',
  anexo: 'anexos',
};

export function LinhaDoTempo({
  itens,
  onAbrir,
}: {
  itens: ItemLinhaTempo[];
  onAbrir: (aba: string) => void;
}) {
  if (!itens.length) {
    return (
      <div className="card">
        <Vazio titulo="Nada registrado ainda">
          Evoluções, procedimentos, anexos e consultas aparecem aqui.
        </Vazio>
      </div>
    );
  }
  return (
    <div className="card">
      <ol className="timeline">
        {itens.map((i) => {
          const resumo =
            i.tipo === 'consulta' && i.resumo
              ? (TEXTO_STATUS_CONSULTA[i.resumo as keyof typeof TEXTO_STATUS_CONSULTA] ?? i.resumo)
              : i.resumo;
          return (
            <li key={`${i.tipo}-${i.id}`} className={`t-${i.tipo}`}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span>
                  <span className="badge">{ROTULO[i.tipo]}</span> <strong>{i.titulo}</strong>
                </span>
                {ABA[i.tipo] && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => onAbrir(ABA[i.tipo]!)}
                  >
                    Abrir
                  </button>
                )}
              </div>
              {resumo && <p style={{ marginTop: 4 }}>{resumo}</p>}
              <p className="muted">
                {fmtDataHora(i.em)}
                {i.autor ? ` · ${i.autor}` : ''}
              </p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
