import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, chamar, mensagemDeErro } from '../../api/client';
import { Abas } from '../../components/Abas';
import { Button } from '../../components/Button';
import { Carregando, ErroCarga } from '../../components/Feedback';
import { fmtDataBR } from '../../lib/datas';
import { idade } from '../../lib/moeda';
import { useToast } from '../../toast/useToast';
import { AcessosTab } from './AcessosTab';
import { AnexosTab } from './AnexosTab';
import { EvolucoesTab } from './EvolucoesTab';
import { LinhaDoTempo } from './LinhaDoTempo';
import { OdontogramaTab } from './OdontogramaTab';
import { PlanosTab } from './PlanosTab';
import { useResumo } from './useProntuario';

const ABAS = [
  { id: 'linha', rotulo: 'Linha do tempo' },
  { id: 'evolucoes', rotulo: 'Evoluções' },
  { id: 'odontograma', rotulo: 'Odontograma e procedimentos' },
  { id: 'planos', rotulo: 'Plano de tratamento' },
  { id: 'anexos', rotulo: 'Anexos' },
  { id: 'acessos', rotulo: 'Acessos' },
];

const TIPO_ALERTA = {
  alergia: 'Alergia',
  medicamento: 'Medicamento',
  condicao: 'Condição',
  outro: 'Outro',
} as const;

export function ProntuarioPage() {
  const { id = '' } = useParams();
  const { avisar } = useToast();
  const [aba, setAba] = useState('linha');
  const resumo = useResumo(id);

  // PDF gerado no servidor; o front só recebe um link de uso único e navega até ele (download).
  const pdf = useMutation({
    mutationFn: () =>
      chamar(api.GET('/pacientes/{id}/prontuario/pdf', { params: { path: { id } } })),
    onSuccess: ({ url }) => window.location.assign(url),
    onError: (e) => avisar(mensagemDeErro(e), 'erro'),
  });

  if (resumo.error) {
    return (
      <div className="page">
        <ErroCarga erro={resumo.error} onTentar={() => resumo.refetch()} />
      </div>
    );
  }
  if (!resumo.data) {
    return (
      <div className="page">
        <Carregando />
      </div>
    );
  }

  const { paciente, alertas, anamnese_atual } = resumo.data;
  const anos = idade(paciente.nascimento);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <p>
            <Link to={`/pacientes/${paciente.id}`}>← Ficha do paciente</Link>
          </p>
          <h1>{paciente.nome}</h1>
          <p className="row">
            <span className="mono">Prontuário #{paciente.numero_prontuario}</span>
            {paciente.nascimento && (
              <span>
                {fmtDataBR(paciente.nascimento)}
                {anos !== null ? ` · ${anos} anos` : ''}
              </span>
            )}
            {!paciente.ativo && <span className="badge">Inativo</span>}
          </p>
        </div>
        <div className="row">
          <Link className="btn btn-secondary" to={`/clinica/anamnese/${paciente.id}`}>
            {anamnese_atual ? `Anamnese v${anamnese_atual.versao}` : 'Registrar anamnese'}
          </Link>
          <Button variante="secondary" carregando={pdf.isPending} onClick={() => pdf.mutate()}>
            Exportar PDF
          </Button>
        </div>
      </div>

      {alertas.length > 0 ? (
        <div className="alertas" role="note" aria-label="Alertas clínicos">
          <strong>Atenção</strong>
          {alertas.map((a, i) => (
            <span key={i} className="alerta-chip">
              {TIPO_ALERTA[a.tipo]}: {a.descricao}
            </span>
          ))}
        </div>
      ) : (
        <div className="alert info" style={{ marginBottom: 16 }}>
          {anamnese_atual
            ? 'Nenhum alerta clínico registrado na anamnese atual.'
            : 'Paciente sem anamnese registrada — registre antes do primeiro procedimento.'}
        </div>
      )}
      {anamnese_atual && !anamnese_atual.assinada_em && (
        <div className="alert" style={{ marginBottom: 16 }}>
          A anamnese v{anamnese_atual.versao} ainda não foi assinada.{' '}
          <Link to={`/clinica/anamnese/${paciente.id}`}>Revisar e assinar</Link>
        </div>
      )}

      <Abas abas={ABAS} ativa={aba} onMudar={setAba} />
      {aba === 'linha' && <LinhaDoTempo itens={resumo.data.linha_do_tempo} onAbrir={setAba} />}
      {aba === 'evolucoes' && <EvolucoesTab pacienteId={id} />}
      {aba === 'odontograma' && <OdontogramaTab pacienteId={id} />}
      {aba === 'planos' && <PlanosTab pacienteId={id} />}
      {aba === 'anexos' && <AnexosTab pacienteId={id} />}
      {aba === 'acessos' && <AcessosTab pacienteId={id} />}
    </div>
  );
}
