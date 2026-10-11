import { useState, type ReactNode } from 'react';
import type { ItemLinhaTempo } from '../../api/types';
import { Chip } from '../../components/Chip';
import {
  IconeAgenda,
  IconeCadeado,
  IconeCheck,
  IconeClipe,
  IconeDocumento,
  IconePrancheta,
} from '../../components/Icones';
import { dataDe, fmtDataCurta, fmtHora, hoje } from '../../lib/datas';
import { TEXTO_STATUS_CONSULTA } from '../../lib/status';

const VISUAL: Record<ItemLinhaTempo['tipo'], { fundo: string; cor: string; icone: ReactNode }> = {
  evolucao: { fundo: '#0F6B63', cor: '#FFFFFF', icone: <IconeDocumento tamanho={16} /> },
  procedimento: { fundo: '#DEF3E7', cor: '#05603A', icone: <IconeCheck tamanho={16} /> },
  anamnese: { fundo: '#FCE8D8', cor: '#7A3209', icone: <IconePrancheta tamanho={16} /> },
  anexo: { fundo: '#ECEAE3', cor: '#3D4B48', icone: <IconeClipe tamanho={16} /> },
  consulta: { fundo: '#ECE8FB', cor: '#43339A', icone: <IconeAgenda tamanho={16} /> },
};
const ABA: Partial<Record<ItemLinhaTempo['tipo'], string>> = {
  evolucao: 'evolucoes',
  procedimento: 'odontograma',
  anexo: 'anexos',
};
const FILTROS = [
  { id: 'todos', rotulo: 'Todos' },
  { id: 'procedimento', rotulo: 'Procedimentos' },
  { id: 'anexo', rotulo: 'Anexos' },
] as const;

export function LinhaDoTempo({
  itens,
  onAbrir,
}: {
  itens: ItemLinhaTempo[];
  onAbrir: (aba: string) => void;
}) {
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]['id']>('todos');
  const visiveis = filtro === 'todos' ? itens : itens.filter((i) => i.tipo === filtro);

  return (
    <section className="card lt">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h2 className="h2">Linha do tempo</h2>
        <span style={{ flexGrow: 1 }} />
        <div style={{ display: 'flex', gap: 6 }}>
          {FILTROS.map((f) => (
            <Chip
              key={f.id}
              ativo={filtro === f.id}
              style={{ height: 32, padding: '0 12px' }}
              onClick={() => setFiltro(f.id)}
            >
              {f.rotulo}
            </Chip>
          ))}
        </div>
      </div>

      {visiveis.length === 0 ? (
        <p style={{ fontSize: 14, color: 'var(--ink-3)' }}>
          {itens.length
            ? 'Nada deste tipo por enquanto.'
            : 'Evoluções, procedimentos, anexos e consultas aparecem aqui.'}
        </p>
      ) : (
        <ol className="lt-lista">
          {visiveis.map((i, n) => {
            const v = VISUAL[i.tipo];
            const dia = dataDe(i.em);
            const detalhe =
              i.tipo === 'consulta' && i.resumo
                ? (TEXTO_STATUS_CONSULTA[i.resumo as keyof typeof TEXTO_STATUS_CONSULTA] ??
                  i.resumo)
                : i.resumo;
            const aba = ABA[i.tipo];
            return (
              <li key={`${i.tipo}-${i.id}`}>
                <div className="lt-trilho">
                  <span className="lt-icone" style={{ background: v.fundo, color: v.cor }}>
                    {v.icone}
                  </span>
                  {n < visiveis.length - 1 && <span className="lt-fio" />}
                </div>
                <div className="lt-texto">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="num lt-data">
                      {fmtDataCurta(dia)} · {fmtHora(i.em)}
                    </span>
                    {dia === hoje() && <span className="badge b-info">Hoje</span>}
                  </div>
                  {aba ? (
                    <button type="button" className="lt-titulo" onClick={() => onAbrir(aba)}>
                      {i.titulo}
                    </button>
                  ) : (
                    <span className="lt-titulo">{i.titulo}</span>
                  )}
                  <span className="lt-detalhe">
                    {[i.autor, detalhe].filter(Boolean).join(' · ')}
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <div className="lt-rodape">
        <IconeCadeado tamanho={14} />
        Seu acesso a este prontuário foi registrado. Registros não podem ser apagados — use adendos.
      </div>
    </section>
  );
}
