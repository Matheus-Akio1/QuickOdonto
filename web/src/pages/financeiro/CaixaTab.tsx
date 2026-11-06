import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, chamar, mensagemDeErro } from '../../api/client';
import type { Caixa } from '../../api/types';
import { Button } from '../../components/Button';
import { Carregando, ErroCarga, Vazio } from '../../components/Feedback';
import { IconeCadeado } from '../../components/Icones';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { fmtDataBR, fmtDataHora, fmtHora } from '../../lib/datas';
import { FORMA, FORMAS_DO_CAIXA } from '../../lib/financeiro';
import { fmtMoeda } from '../../lib/moeda';
import { useToast } from '../../toast/useToast';
import { MotivoDialog } from '../os/MotivoDialog';

function useCaixa() {
  return useQuery({
    queryKey: ['financeiro', 'caixa', 'hoje'],
    queryFn: () => chamar(api.GET('/financeiro/caixa/hoje')),
  });
}

function useAcoesDoCaixa(aoConcluir: () => void) {
  const qc = useQueryClient();
  const { avisar } = useToast();
  const pronto = (texto: string) => {
    qc.invalidateQueries({ queryKey: ['financeiro'] });
    avisar(texto, 'ok');
    aoConcluir();
  };
  const fechar = useMutation({
    mutationFn: () => chamar(api.POST('/financeiro/caixa/fechar', { body: {} })),
    onSuccess: () => pronto('Caixa do dia fechado.'),
    onError: (e) => avisar(mensagemDeErro(e), 'erro'),
  });
  const reabrir = useMutation({
    mutationFn: ({ id, justificativa }: { id: string; justificativa: string }) =>
      chamar(
        api.POST('/financeiro/caixa/{id}/reabrir', {
          params: { path: { id } },
          body: { justificativa },
        }),
      ),
    onSuccess: () => pronto('Caixa reaberto. A justificativa ficou registrada.'),
    onError: (e) => avisar(mensagemDeErro(e), 'erro'),
  });
  return { fechar, reabrir };
}

function Formas({ caixa }: { caixa: Caixa }) {
  const maior = Math.max(...FORMAS_DO_CAIXA.map((f) => caixa.totais.por_forma[f] ?? 0), 1);
  const outras = Object.entries(caixa.totais.por_forma)
    .filter(([f, v]) => !FORMAS_DO_CAIXA.includes(f as never) && v > 0)
    .reduce((n, [, v]) => n + v, 0);
  return (
    <>
      {FORMAS_DO_CAIXA.map((f) => (
        <div key={f} className="fin-forma">
          <div className="fin-par">
            <span>{FORMA[f]}</span>
            <b>{fmtMoeda(caixa.totais.por_forma[f] ?? 0)}</b>
          </div>
          <div className="fin-trilho">
            <div style={{ width: `${((caixa.totais.por_forma[f] ?? 0) / maior) * 100}%` }} />
          </div>
        </div>
      ))}
      {outras > 0 && (
        <div className="fin-par">
          <span>Boleto e transferência</span>
          <b>{fmtMoeda(outras)}</b>
        </div>
      )}
      <div className="fin-total">
        <span style={{ fontWeight: 700 }}>Total recebido</span>
        <b>{fmtMoeda(caixa.totais.entradas)}</b>
      </div>
      {caixa.totais.saidas > 0 && (
        <div className="fin-par">
          <span>Pagamentos do dia</span>
          <b>− {fmtMoeda(caixa.totais.saidas)}</b>
        </div>
      )}
    </>
  );
}

/** Cartão "Caixa de hoje" do fluxo de caixa (prancha "Adm. Clínica · financeiro"). */
export function CaixaCartao() {
  const caixa = useCaixa();
  const [dialogo, setDialogo] = useState<'fechar' | 'reabrir' | null>(null);
  const { fechar, reabrir } = useAcoesDoCaixa(() => setDialogo(null));
  const c = caixa.data;
  const fechado = c?.situacao === 'fechado';

  return (
    <div className="card">
      <div className="fin-card-cab">
        <div>
          <h2 className="h3">Caixa de hoje</h2>
          <span className="sub">
            {!c
              ? ' '
              : fechado && c.fechado_em
                ? `Fechado às ${fmtHora(c.fechado_em)} por ${c.fechado_por ?? '—'}`
                : c.reaberto_em
                  ? `Reaberto às ${fmtHora(c.reaberto_em)} por ${c.reaberto_por ?? '—'}`
                  : `${c.totais.movimentos} ${c.totais.movimentos === 1 ? 'movimento' : 'movimentos'} até agora`}
          </span>
        </div>
        {c && (
          <span className={`badge ${fechado ? 'b-mut' : 'b-ok'}`} style={{ marginLeft: 'auto' }}>
            {fechado ? 'Fechado' : 'Aberto'}
          </span>
        )}
      </div>
      <div className="fin-card-corpo">
        {caixa.error ? (
          <ErroCarga erro={caixa.error} />
        ) : !c ? (
          <Carregando linhas={3} />
        ) : (
          <>
            <Formas caixa={c} />
            {fechado ? (
              <Button variante="secondary" onClick={() => setDialogo('reabrir')}>
                Reabrir caixa
              </Button>
            ) : (
              <Button onClick={() => setDialogo('fechar')}>
                <IconeCadeado />
                Fechar caixa do dia
              </Button>
            )}
          </>
        )}
      </div>
      {dialogo === 'fechar' && c && (
        <ConfirmDialog
          titulo="Fechar o caixa de hoje?"
          confirmar="Fechar caixa"
          carregando={fechar.isPending}
          onCancelar={() => setDialogo(null)}
          onConfirmar={() => fechar.mutate()}
        >
          <p>
            Total recebido: <b>{fmtMoeda(c.totais.entradas)}</b>. Depois de fechado, nenhum
            recebimento ou pagamento com a data de hoje entra — só reabrindo o caixa com
            justificativa.
          </p>
        </ConfirmDialog>
      )}
      {dialogo === 'reabrir' && c?.id && (
        <MotivoDialog
          titulo="Reabrir o caixa"
          descricao="A reabertura fica registrada com o seu usuário e a justificativa."
          rotulo="Justificativa (mín. 5 caracteres)"
          confirmar="Reabrir caixa"
          carregando={reabrir.isPending}
          onConfirmar={(justificativa) => reabrir.mutate({ id: c.id as string, justificativa })}
          onFechar={() => setDialogo(null)}
        />
      )}
    </div>
  );
}

/** Aba "Fechamento de caixa": o caixa de hoje e o histórico de fechamentos. */
export function CaixaTab() {
  const lista = useQuery({
    queryKey: ['financeiro', 'caixa', 'fechamentos'],
    queryFn: () => chamar(api.GET('/financeiro/caixa/fechamentos')),
  });
  return (
    <div className="fin-layout">
      <div className="fin-lateral">
        <CaixaCartao />
      </div>
      <div className="fin-principal">
        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="fin-card-cab">
            <div>
              <h2 className="h3">Fechamentos</h2>
              <span className="sub">Últimos 60 dias</span>
            </div>
          </div>
          {lista.error ? (
            <ErroCarga erro={lista.error} />
          ) : !lista.data ? (
            <div style={{ padding: 16 }}>
              <Carregando linhas={3} />
            </div>
          ) : !lista.data.length ? (
            <Vazio titulo="Nenhum caixa fechado ainda">
              Feche o caixa de hoje para registrar os totais por forma de pagamento.
            </Vazio>
          ) : (
            lista.data.map((c) => (
              <div key={c.id} className="fin-conta" style={{ padding: '12px 20px' }}>
                <div className="fin-desc">
                  <b>{fmtDataBR(c.data)}</b>
                  <small>
                    Fechado em {fmtDataHora(c.fechado_em)} por {c.fechado_por ?? '—'}
                  </small>
                  {c.justificativa && (
                    <small style={{ whiteSpace: 'normal' }}>
                      Reabertura{c.reaberto_por ? ` (${c.reaberto_por})` : ''}: {c.justificativa}
                    </small>
                  )}
                </div>
                <div className="stack" style={{ gap: 4, alignItems: 'flex-end' }}>
                  <b className="num">{fmtMoeda(c.totais.entradas)}</b>
                  <span className={`badge ${c.situacao === 'fechado' ? 'b-mut' : 'b-warn'}`}>
                    {c.situacao === 'fechado' ? 'Fechado' : 'Reaberto'}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
