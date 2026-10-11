import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, chamar, mensagemDeErro } from '../../api/client';
import type { Alerta } from '../../api/types';
import { Abas } from '../../components/Abas';
import { Carregando, ErroCarga } from '../../components/Feedback';
import { IconeAlerta, IconeBaixar, IconeMais, IconeSetaDireita } from '../../components/Icones';
import { BuscaCabecalho, Cabecalho } from '../../layout/Cabecalho';
import { useToast } from '../../toast/useToast';
import { AcessosTab } from './AcessosTab';
import { AnexosTab } from './AnexosTab';
import { CartaoPaciente } from './CartaoPaciente';
import { EvolucoesTab } from './EvolucoesTab';
import { OdontogramaTab } from './OdontogramaTab';
import { PlanosTab } from './PlanosTab';
import { ResumoTab } from './ResumoTab';
import { useResumo } from './useProntuario';

const TIPO_ALERTA: Record<Alerta['tipo'], { rotulo: string; classe: string }> = {
  alergia: { rotulo: 'Alergia', classe: 'b-bad' },
  medicamento: { rotulo: 'Medicamento', classe: 'b-warn' },
  condicao: { rotulo: 'Condição', classe: 'b-warn' },
  outro: { rotulo: 'Atenção', classe: 'b-warn' },
};

export function ProntuarioPage() {
  const { id = '' } = useParams();
  const { avisar } = useToast();
  const navegar = useNavigate();
  const [aba, setAba] = useState('resumo');
  const [dente, setDente] = useState<number | null>(null);
  const [busca, setBusca] = useState('');
  const resumo = useResumo(id);

  // PDF gerado no servidor; o front só recebe um link de uso único e navega até ele (download).
  const pdf = useMutation({
    mutationFn: () =>
      chamar(api.GET('/pacientes/{id}/prontuario/pdf', { params: { path: { id } } })),
    onSuccess: ({ url }) => window.location.assign(url),
    onError: (e) => avisar(mensagemDeErro(e), 'erro'),
  });

  const cabecalho = (
    <Cabecalho trilha="Clínica / Prontuário" titulo="Prontuário do paciente">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (busca.trim()) navegar('/clinica/prontuario', { state: { busca: busca.trim() } });
        }}
      >
        <BuscaCabecalho
          valor={busca}
          onMudar={setBusca}
          placeholder="Buscar paciente"
          largura={300}
        />
      </form>
    </Cabecalho>
  );

  if (resumo.error || !resumo.data) {
    return (
      <>
        {cabecalho}
        <div className="content">
          {resumo.error ? (
            <ErroCarga erro={resumo.error} onTentar={() => resumo.refetch()} />
          ) : (
            <Carregando />
          )}
        </div>
      </>
    );
  }

  const { paciente, alertas, anamnese_atual, linha_do_tempo } = resumo.data;
  const anexos = linha_do_tempo.filter((i) => i.tipo === 'anexo').length;
  const abas = [
    { id: 'resumo', rotulo: 'Resumo' },
    { id: 'anamnese', rotulo: 'Anamnese' },
    { id: 'odontograma', rotulo: 'Odontograma' },
    { id: 'procedimentos', rotulo: 'Procedimentos' },
    { id: 'evolucoes', rotulo: 'Evoluções' },
    {
      id: 'anexos',
      rotulo: (
        <>
          Anexos
          {anexos > 0 && <span className="num tab-conta">{anexos}</span>}
        </>
      ),
    },
    { id: 'acessos', rotulo: 'Acessos' },
  ];
  const abrir = (qual: string) => {
    if (qual === 'anamnese') navegar(`/clinica/anamnese/${paciente.id}`);
    else setAba(qual);
  };

  return (
    <>
      {cabecalho}
      <div className="content" style={{ gap: 14 }}>
        <CartaoPaciente
          paciente={paciente}
          faixa={
            alertas.length > 0 ? (
              <div className="pac-alertas" role="note" aria-label="Alertas clínicos">
                <span className="pac-alertas-titulo">
                  <IconeAlerta tamanho={16} />
                  Alertas clínicos
                </span>
                {alertas.map((a, i) => (
                  <span key={i} className={`badge ${TIPO_ALERTA[a.tipo].classe} pac-alerta`}>
                    <span style={{ fontWeight: 700 }}>{TIPO_ALERTA[a.tipo].rotulo}</span> ·{' '}
                    {a.descricao}
                  </span>
                ))}
                {anamnese_atual && (
                  <Link className="pac-alertas-link" to={`/clinica/anamnese/${paciente.id}`}>
                    Ver anamnese (v{anamnese_atual.versao})
                    <IconeSetaDireita tamanho={14} />
                  </Link>
                )}
              </div>
            ) : (
              <div className="pac-aviso">
                {anamnese_atual
                  ? 'Nenhum alerta clínico na anamnese atual.'
                  : 'Paciente sem anamnese — registre antes do primeiro procedimento.'}
                <Link
                  className="pac-alertas-link"
                  style={{ color: 'var(--primary)' }}
                  to={`/clinica/anamnese/${paciente.id}`}
                >
                  {anamnese_atual
                    ? `Ver anamnese (v${anamnese_atual.versao})`
                    : 'Registrar anamnese'}
                  <IconeSetaDireita tamanho={14} />
                </Link>
              </div>
            )
          }
        >
          <button
            type="button"
            className="btn"
            disabled={pdf.isPending}
            onClick={() => pdf.mutate()}
          >
            <IconeBaixar />
            PDF
          </button>
          <button type="button" className="btn pri" onClick={() => setAba('evolucoes')}>
            <IconeMais />
            Nova evolução
          </button>
        </CartaoPaciente>

        {anamnese_atual && !anamnese_atual.assinada_em && (
          <div className="alert">
            A anamnese v{anamnese_atual.versao} ainda não foi assinada.{' '}
            <Link to={`/clinica/anamnese/${paciente.id}`}>Revisar e assinar</Link>
          </div>
        )}

        <Abas abas={abas} ativa={aba} onMudar={abrir} />
        {aba === 'resumo' && (
          <ResumoTab
            pacienteId={id}
            linha={linha_do_tempo}
            dente={dente}
            onDente={setDente}
            onAbrir={abrir}
          />
        )}
        {aba === 'odontograma' && (
          <OdontogramaTab pacienteId={id} dente={dente} onDente={setDente} />
        )}
        {aba === 'procedimentos' && <PlanosTab pacienteId={id} />}
        {aba === 'evolucoes' && <EvolucoesTab pacienteId={id} />}
        {aba === 'anexos' && <AnexosTab pacienteId={id} />}
        {aba === 'acessos' && <AcessosTab pacienteId={id} />}
      </div>
    </>
  );
}
