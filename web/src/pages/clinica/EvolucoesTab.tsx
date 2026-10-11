import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, chamar, mensagemDeErro } from '../../api/client';
import type { Evolucao } from '../../api/types';
import { Button } from '../../components/Button';
import { Carregando, ErroCarga, Vazio } from '../../components/Feedback';
import { Paginacao } from '../../components/Paginacao';
import { fmtDataHora } from '../../lib/datas';
import { useToast } from '../../toast/useToast';
import { chave, CLINICO, useInvalidarProntuario } from './useProntuario';

const LIMITE = 10;

export function EvolucoesTab({ pacienteId }: { pacienteId: string }) {
  const { avisar } = useToast();
  const invalidar = useInvalidarProntuario(pacienteId);
  const [pagina, setPagina] = useState(1);
  const [texto, setTexto] = useState('');

  const lista = useQuery({
    queryKey: chave(pacienteId, 'evolucoes', String(pagina)),
    queryFn: () =>
      chamar(
        api.GET('/pacientes/{id}/evolucoes', {
          params: { path: { id: pacienteId }, query: { pagina, limite: LIMITE } },
        }),
      ),
    ...CLINICO,
  });

  const salvar = useMutation({
    mutationFn: () =>
      chamar(
        api.POST('/pacientes/{id}/evolucoes', {
          params: { path: { id: pacienteId } },
          body: { conteudo: texto.trim() },
        }),
      ),
    onSuccess: () => {
      setTexto('');
      setPagina(1);
      invalidar();
      avisar('Evolução registrada.', 'ok');
    },
    onError: (e) => avisar(mensagemDeErro(e), 'erro'),
  });

  return (
    <div className="stack">
      <section className="card">
        <h2 style={{ marginBottom: 10 }}>Nova evolução</h2>
        <label className="sr-only" htmlFor="nova-evolucao">
          Texto da evolução
        </label>
        <textarea
          id="nova-evolucao"
          className="textarea"
          rows={4}
          maxLength={10000}
          placeholder="Descreva o atendimento: achados, conduta, orientações…"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
        />
        <div className="row" style={{ justifyContent: 'space-between', marginTop: 10 }}>
          <span className="muted">
            Depois de salva, a evolução não pode ser editada — correções entram como adendo.
          </span>
          <Button
            disabled={texto.trim().length < 3}
            carregando={salvar.isPending}
            onClick={() => salvar.mutate()}
          >
            Registrar evolução
          </Button>
        </div>
      </section>

      {lista.error ? (
        <ErroCarga erro={lista.error} onTentar={() => lista.refetch()} />
      ) : !lista.data ? (
        <Carregando />
      ) : !lista.data.itens.length ? (
        <div className="card">
          <Vazio titulo="Nenhuma evolução registrada" />
        </div>
      ) : (
        <>
          {lista.data.itens.map((e) => (
            <ItemEvolucao key={e.id} evolucao={e} aoAdicionar={invalidar} />
          ))}
          <Paginacao pagina={pagina} limite={LIMITE} total={lista.data.total} onMudar={setPagina} />
        </>
      )}
    </div>
  );
}

function ItemEvolucao({ evolucao, aoAdicionar }: { evolucao: Evolucao; aoAdicionar: () => void }) {
  const { avisar } = useToast();
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState('');
  const adendo = useMutation({
    mutationFn: () =>
      chamar(
        api.POST('/evolucoes/{id}/adendos', {
          params: { path: { id: evolucao.id } },
          body: { conteudo: texto.trim() },
        }),
      ),
    onSuccess: () => {
      setTexto('');
      setAberto(false);
      aoAdicionar();
      avisar('Adendo registrado.', 'ok');
    },
    onError: (e) => avisar(mensagemDeErro(e), 'erro'),
  });

  return (
    <article className="evolucao">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <strong>
          {fmtDataHora(evolucao.criado_em)} · {evolucao.profissional_nome}
        </strong>
        {!aberto && (
          <Button variante="ghost" pequeno onClick={() => setAberto(true)}>
            Adicionar adendo
          </Button>
        )}
      </div>
      <p className="texto">{evolucao.conteudo}</p>
      {evolucao.adendos.map((a) => (
        <div key={a.id} className="adendo">
          <strong>Adendo</strong> · {fmtDataHora(a.criado_em)} · {a.profissional_nome}
          <p className="texto">{a.conteudo}</p>
        </div>
      ))}
      {aberto && (
        <div className="stack" style={{ marginTop: 10, gap: 8 }}>
          <label className="sr-only" htmlFor={`adendo-${evolucao.id}`}>
            Texto do adendo
          </label>
          <textarea
            id={`adendo-${evolucao.id}`}
            className="textarea"
            rows={3}
            maxLength={5000}
            placeholder="Correção ou complemento (o texto original permanece)"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
          <div className="row">
            <Button
              pequeno
              disabled={texto.trim().length < 3}
              carregando={adendo.isPending}
              onClick={() => adendo.mutate()}
            >
              Salvar adendo
            </Button>
            <Button variante="secondary" pequeno onClick={() => setAberto(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </article>
  );
}
