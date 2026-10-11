import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, chamar, mensagemDeErro } from '../../api/client';
import type { Alerta, Anamnese } from '../../api/types';
import { useAuth } from '../../auth/useAuth';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Carregando, ErroCarga, Vazio } from '../../components/Feedback';
import { fmtDataHora } from '../../lib/datas';
import { useToast } from '../../toast/useToast';
import { chave, CLINICO, useInvalidarProntuario, useResumo } from './useProntuario';

const TEXTOS = [
  { chave: 'queixa_principal', rotulo: 'Queixa principal' },
  { chave: 'historico_medico', rotulo: 'Histórico médico relevante' },
  { chave: 'historico_odontologico', rotulo: 'Histórico odontológico' },
] as const;
const CONDICOES = [
  { chave: 'diabetes', rotulo: 'Diabetes' },
  { chave: 'hipertensao', rotulo: 'Hipertensão' },
  { chave: 'cardiopatia', rotulo: 'Cardiopatia' },
  { chave: 'problema_coagulacao', rotulo: 'Problema de coagulação' },
  { chave: 'gestante', rotulo: 'Gestante' },
  { chave: 'fumante', rotulo: 'Fumante' },
  { chave: 'em_tratamento_medico', rotulo: 'Em tratamento médico' },
] as const;
const ROTULOS: Record<string, string> = {
  ...Object.fromEntries([...TEXTOS, ...CONDICOES].map((q) => [q.chave, q.rotulo])),
  medicamentos: 'Medicamentos em uso',
};
const TIPO_ALERTA: Record<Alerta['tipo'], string> = {
  alergia: 'Alergia',
  medicamento: 'Medicamento',
  condicao: 'Condição',
  outro: 'Outro',
};

type Respostas = Record<string, string | boolean | number | string[]>;

export function AnamnesePage() {
  const { id = '' } = useParams();
  const { usuario } = useAuth();
  const { avisar } = useToast();
  const invalidar = useInvalidarProntuario(id);
  const resumo = useResumo(id);
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);
  const [assinar, setAssinar] = useState(false);

  const versoes = useQuery({
    queryKey: chave(id, 'anamneses'),
    queryFn: () => chamar(api.GET('/pacientes/{id}/anamneses', { params: { path: { id } } })),
    ...CLINICO,
  });
  const atualId = selecionada ?? versoes.data?.[0]?.id ?? null;
  const detalhe = useQuery({
    queryKey: chave(id, 'anamnese', atualId ?? ''),
    enabled: Boolean(atualId),
    queryFn: () => chamar(api.GET('/anamneses/{id}', { params: { path: { id: atualId! } } })),
    ...CLINICO,
  });

  const assinatura = useMutation({
    mutationFn: (anamneseId: string) =>
      chamar(api.POST('/anamneses/{id}/assinatura', { params: { path: { id: anamneseId } } })),
    onSuccess: () => {
      setAssinar(false);
      invalidar();
      avisar('Anamnese assinada.', 'ok');
    },
    onError: (e) => {
      setAssinar(false);
      avisar(mensagemDeErro(e), 'erro');
    },
  });

  if (versoes.error)
    return (
      <div className="page">
        <ErroCarga erro={versoes.error} onTentar={() => versoes.refetch()} />
      </div>
    );
  if (!versoes.data || !resumo.data)
    return (
      <div className="page">
        <Carregando />
      </div>
    );

  const a = detalhe.data;
  const ehUltima = a && versoes.data[0]?.id === a.id;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <p>
            <Link to={`/clinica/prontuario/${id}`}>← Prontuário</Link>
          </p>
          <h1>Anamnese — {resumo.data.paciente.nome}</h1>
          <p>Cada registro cria uma nova versão; as anteriores ficam preservadas.</p>
        </div>
        {!editando && (
          <Button onClick={() => setEditando(true)}>
            {versoes.data.length ? 'Nova versão' : 'Registrar anamnese'}
          </Button>
        )}
      </div>

      {editando ? (
        <FormAnamnese
          pacienteId={id}
          base={versoes.data.length ? a : undefined}
          onFechar={() => setEditando(false)}
          aoSalvar={(nova) => {
            setSelecionada(nova.id);
            setEditando(false);
          }}
        />
      ) : !versoes.data.length ? (
        <div className="card">
          <Vazio titulo="Nenhuma anamnese registrada">
            Registre a anamnese antes do primeiro procedimento.
          </Vazio>
        </div>
      ) : (
        <div className="grid-2" style={{ gridTemplateColumns: 'minmax(220px, 280px) 1fr' }}>
          <nav className="card" aria-label="Versões">
            <h2 style={{ marginBottom: 10 }}>Versões</h2>
            <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0, gap: 6 }}>
              {versoes.data.map((v) => (
                <li key={v.id}>
                  <button
                    type="button"
                    className={`btn ${v.id === atualId ? '' : 'btn-secondary'}`}
                    style={{
                      width: '100%',
                      justifyContent: 'space-between',
                      height: 'auto',
                      padding: '8px 12px',
                    }}
                    aria-current={v.id === atualId}
                    onClick={() => setSelecionada(v.id)}
                  >
                    <span>v{v.versao}</span>
                    <span style={{ fontWeight: 500, fontSize: '0.8rem' }}>
                      {fmtDataHora(v.criado_em)}
                      <br />
                      {v.assinada_em ? 'Assinada' : 'Não assinada'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          <section className="card">
            {detalhe.error ? (
              <ErroCarga erro={detalhe.error} />
            ) : !a ? (
              <Carregando />
            ) : (
              <div className="stack">
                <div className="card-head" style={{ marginBottom: 0 }}>
                  <div>
                    <h2>Versão {a.versao}</h2>
                    <p className="muted">
                      {a.profissional_nome} · {fmtDataHora(a.criado_em)}
                    </p>
                  </div>
                  {a.assinada_em ? (
                    <span className="badge badge-ok">Assinada em {fmtDataHora(a.assinada_em)}</span>
                  ) : (
                    <span className="badge badge-warn">Não assinada</span>
                  )}
                </div>
                {!ehUltima && (
                  <div className="alert info">Versão anterior — mantida apenas para consulta.</div>
                )}
                <ExibirAnamnese anamnese={a} />
                {!a.assinada_em && (
                  <div className="row">
                    <Button onClick={() => setAssinar(true)}>Assinar</Button>
                    {a.profissional_nome !== usuario?.nome && (
                      <span className="muted">Só o profissional que registrou pode assinar.</span>
                    )}
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      )}

      {assinar && a && (
        <ConfirmDialog
          titulo={`Assinar a versão ${a.versao}?`}
          confirmar="Assinar"
          carregando={assinatura.isPending}
          onCancelar={() => setAssinar(false)}
          onConfirmar={() => assinatura.mutate(a.id)}
        >
          <p>Depois de assinada, a versão é definitiva. Mudanças futuras exigem uma nova versão.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}

function ExibirAnamnese({ anamnese }: { anamnese: Anamnese }) {
  const r = anamnese.respostas as Respostas;
  const sim = CONDICOES.filter((c) => r[c.chave] === true).map((c) => c.rotulo);
  const conhecidas = new Set([
    ...TEXTOS.map((t) => t.chave),
    ...CONDICOES.map((c) => c.chave),
    'medicamentos',
  ]);
  const outras = Object.entries(r).filter(([k]) => !conhecidas.has(k));
  return (
    <>
      <div>
        <h3>Alertas</h3>
        {anamnese.alertas.length ? (
          <div className="row" style={{ marginTop: 6 }}>
            {anamnese.alertas.map((al, i) => (
              <span key={i} className="badge badge-danger">
                {TIPO_ALERTA[al.tipo]}: {al.descricao}
              </span>
            ))}
          </div>
        ) : (
          <p className="muted">Nenhum alerta.</p>
        )}
      </div>
      <dl className="dl">
        {TEXTOS.map((t) => (
          <FragmentoDl key={t.chave} rotulo={t.rotulo} valor={(r[t.chave] as string) || '—'} />
        ))}
        <FragmentoDl rotulo="Condições" valor={sim.length ? sim.join(', ') : 'Nenhuma informada'} />
        <FragmentoDl
          rotulo="Medicamentos em uso"
          valor={
            Array.isArray(r.medicamentos) && r.medicamentos.length ? r.medicamentos.join(', ') : '—'
          }
        />
        {outras.map(([k, v]) => (
          <FragmentoDl
            key={k}
            rotulo={ROTULOS[k] ?? k.replace(/_/g, ' ')}
            valor={Array.isArray(v) ? v.join(', ') : String(v)}
          />
        ))}
      </dl>
    </>
  );
}

function FragmentoDl({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <>
      <dt>{rotulo}</dt>
      <dd style={{ whiteSpace: 'pre-wrap' }}>{valor}</dd>
    </>
  );
}

function FormAnamnese({
  pacienteId,
  base,
  onFechar,
  aoSalvar,
}: {
  pacienteId: string;
  base?: Anamnese;
  onFechar: () => void;
  aoSalvar: (a: Anamnese) => void;
}) {
  const { avisar } = useToast();
  const invalidar = useInvalidarProntuario(pacienteId);
  // A nova versão parte da anterior: o dentista revisa em vez de redigitar tudo.
  const [respostas, setRespostas] = useState<Respostas>(() => ({
    ...((base?.respostas as Respostas) ?? {}),
  }));
  const [medicamentos, setMedicamentos] = useState(() =>
    Array.isArray(base?.respostas?.medicamentos)
      ? (base!.respostas.medicamentos as string[]).join('\n')
      : '',
  );
  const [alertas, setAlertas] = useState<Alerta[]>(() => base?.alertas ?? []);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => setErro(null), [respostas, alertas]);

  const salvar = useMutation({
    mutationFn: () => {
      const meds = medicamentos
        .split('\n')
        .map((m) => m.trim())
        .filter(Boolean);
      const todas: Respostas = { ...respostas, medicamentos: meds };
      const limpas = Object.fromEntries(
        Object.entries(todas).filter(([, v]) => v !== '' && !(Array.isArray(v) && !v.length)),
      );
      return chamar(
        api.POST('/pacientes/{id}/anamneses', {
          params: { path: { id: pacienteId } },
          body: {
            respostas: limpas,
            alertas: alertas.map((a) => ({ ...a, descricao: a.descricao.trim() })),
          },
        }),
      );
    },
    onSuccess: (nova) => {
      invalidar();
      avisar(`Versão ${nova.versao} registrada. Revise e assine.`, 'ok');
      aoSalvar(nova);
    },
    onError: (e) => setErro(mensagemDeErro(e)),
  });

  const alertaInvalido = alertas.some((a) => a.descricao.trim().length < 2);

  return (
    <section className="card stack">
      <h2>{base ? `Nova versão (a partir da v${base.versao})` : 'Primeira anamnese'}</h2>
      {erro && (
        <div className="alert" role="alert">
          {erro}
        </div>
      )}

      {TEXTOS.map((t) => (
        <label key={t.chave} className="field">
          <span className="label">{t.rotulo}</span>
          <textarea
            className="textarea"
            rows={2}
            maxLength={2000}
            value={(respostas[t.chave] as string) ?? ''}
            onChange={(e) => setRespostas((r) => ({ ...r, [t.chave]: e.target.value }))}
          />
        </label>
      ))}

      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="label" style={{ marginBottom: 6 }}>
          Condições
        </legend>
        <div className="faces-check">
          {CONDICOES.map((c) => (
            <label key={c.chave} className="check">
              <input
                type="checkbox"
                checked={respostas[c.chave] === true}
                onChange={(e) => setRespostas((r) => ({ ...r, [c.chave]: e.target.checked }))}
              />
              {c.rotulo}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="field">
        <span className="label">Medicamentos em uso</span>
        <span className="hint">Um por linha.</span>
        <textarea
          className="textarea"
          rows={3}
          value={medicamentos}
          onChange={(e) => setMedicamentos(e.target.value)}
        />
      </label>

      <fieldset style={{ border: 0, padding: 0, margin: 0 }} className="stack">
        <legend className="label">Alertas clínicos (aparecem em destaque no prontuário)</legend>
        {alertas.map((al, i) => (
          <div key={i} className="row">
            <label className="sr-only" htmlFor={`alerta-tipo-${i}`}>
              Tipo do alerta {i + 1}
            </label>
            <select
              id={`alerta-tipo-${i}`}
              className="select"
              style={{ width: 'auto' }}
              value={al.tipo}
              onChange={(e) =>
                setAlertas((l) =>
                  l.map((x, j) => (j === i ? { ...x, tipo: e.target.value as Alerta['tipo'] } : x)),
                )
              }
            >
              {Object.entries(TIPO_ALERTA).map(([v, r]) => (
                <option key={v} value={v}>
                  {r}
                </option>
              ))}
            </select>
            <label className="sr-only" htmlFor={`alerta-desc-${i}`}>
              Descrição do alerta {i + 1}
            </label>
            <input
              id={`alerta-desc-${i}`}
              className="input"
              style={{ flex: 1, minWidth: 180 }}
              maxLength={300}
              placeholder="Ex.: Penicilina"
              value={al.descricao}
              aria-invalid={al.descricao.trim().length < 2}
              onChange={(e) =>
                setAlertas((l) =>
                  l.map((x, j) => (j === i ? { ...x, descricao: e.target.value } : x)),
                )
              }
            />
            <Button
              variante="ghost"
              pequeno
              onClick={() => setAlertas((l) => l.filter((_, j) => j !== i))}
            >
              Remover
            </Button>
          </div>
        ))}
        <div>
          <Button
            variante="secondary"
            pequeno
            onClick={() => setAlertas((l) => [...l, { tipo: 'alergia', descricao: '' }])}
          >
            + Adicionar alerta
          </Button>
        </div>
      </fieldset>

      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <Button variante="secondary" onClick={onFechar}>
          Cancelar
        </Button>
        <Button
          disabled={alertaInvalido}
          carregando={salvar.isPending}
          onClick={() => salvar.mutate()}
        >
          Salvar nova versão
        </Button>
      </div>
      {alertaInvalido && (
        <p className="error">Preencha a descrição de todos os alertas (mín. 2 caracteres).</p>
      )}
    </section>
  );
}
