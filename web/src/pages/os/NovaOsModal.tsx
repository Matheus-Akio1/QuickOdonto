import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api, chamar, mensagemDeErro } from '../../api/client';
import type { LabCliente } from '../../api/types';
import { Button } from '../../components/Button';
import { Overlay } from '../../components/Overlay';
import { hoje } from '../../lib/datas';
import { lerElementos, NOME_LABORATORIO, TIPOS_SUGERIDOS } from '../../lib/os';
import { useDebounce } from '../../lib/useDebounce';
import { useToast } from '../../toast/useToast';
import { useInvalidarOs } from './useOs';

interface Props {
  /** "propria": OS da clínica, com paciente do cadastro. "externa": criada pelo laboratório. */
  origem: 'propria' | 'externa';
  pacienteId?: string;
  clienteId?: string;
  clientes?: LabCliente[];
  onFechar: () => void;
  aoCriar?: (id: string) => void;
}

export function NovaOsModal({ origem, pacienteId, clienteId, clientes, onFechar, aoCriar }: Props) {
  const { avisar } = useToast();
  const invalidar = useInvalidarOs();
  const propria = origem === 'propria';
  const [paciente, setPaciente] = useState<{ id: string; nome: string } | null>(null);
  const [busca, setBusca] = useState('');
  const termo = useDebounce(busca.trim(), 300);
  const [cliente, setCliente] = useState(clienteId ?? '');
  const [pacienteNome, setPacienteNome] = useState('');
  const [dentistaNome, setDentistaNome] = useState('');
  const [profissional, setProfissional] = useState('');
  const [tipo, setTipo] = useState('');
  const [elementos, setElementos] = useState('');
  const [cor, setCor] = useState('');
  const [material, setMaterial] = useState('');
  const [previsao, setPrevisao] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  const pre = useQuery({
    queryKey: ['paciente', pacienteId],
    enabled: propria && Boolean(pacienteId),
    queryFn: () => chamar(api.GET('/pacientes/{id}', { params: { path: { id: pacienteId! } } })),
  });
  useEffect(() => {
    if (pre.data) setPaciente({ id: pre.data.id, nome: pre.data.nome });
  }, [pre.data]);

  const resultados = useQuery({
    queryKey: ['pacientes', 'seletor', termo],
    enabled: propria && termo.length >= 2 && !paciente,
    queryFn: () => chamar(api.POST('/pacientes/buscar', { body: { busca: termo, limite: 6 } })),
  });
  const profs = useQuery({
    queryKey: ['profissionais'],
    enabled: propria,
    queryFn: () => chamar(api.GET('/profissionais')),
  });
  const tipos = useQuery({
    queryKey: ['os', 'tipos'],
    queryFn: () => chamar(api.GET('/ordens-servico/tipos-trabalho')),
    staleTime: 60_000,
  });
  const sugestoes = [...new Set([...(tipos.data ?? []), ...TIPOS_SUGERIDOS])].sort((a, b) =>
    a.localeCompare(b, 'pt-BR'),
  );

  const lista = lerElementos(elementos);
  const criar = useMutation({
    mutationFn: () => {
      const comuns = {
        tipo_trabalho: tipo.trim(),
        elementos: lista ?? [],
        cor: cor.trim() || null,
        material: material.trim() || null,
        observacoes: observacoes.trim() || null,
      };
      return chamar(
        api.POST('/ordens-servico', {
          body: propria
            ? {
                ...comuns,
                paciente_id: paciente!.id,
                profissional_id: profissional || null,
                previsao_entrega: previsao,
              }
            : {
                ...comuns,
                cliente_id: cliente,
                paciente_nome: pacienteNome.trim(),
                dentista_nome: dentistaNome.trim() || null,
                previsao_entrega: previsao,
              },
        }),
      );
    },
    onSuccess: (os) => {
      invalidar();
      avisar(`${os.numero} criada.`, 'ok');
      onFechar();
      aoCriar?.(os.id);
    },
    onError: (e) => setErro(mensagemDeErro(e)),
  });

  const podeSalvar =
    tipo.trim().length >= 2 &&
    lista !== null &&
    Boolean(previsao) &&
    (propria ? Boolean(paciente) : Boolean(cliente && pacienteNome.trim().length >= 2));

  return (
    <Overlay
      titulo="Nova ordem de serviço"
      descricao={
        propria
          ? 'A OS vai direto para o laboratório, que passa a atualizar as etapas.'
          : 'OS de cliente externo: já entra como recebida na produção.'
      }
      onFechar={onFechar}
      largo
      rodape={
        <>
          <Button variante="secondary" onClick={onFechar}>
            Cancelar
          </Button>
          <Button
            carregando={criar.isPending}
            disabled={!podeSalvar}
            onClick={() => {
              setErro(null);
              criar.mutate();
            }}
          >
            Criar OS
          </Button>
        </>
      }
    >
      <div className="stack">
        {erro && (
          <div className="alert" role="alert">
            {erro}
          </div>
        )}

        {propria ? (
          <div className="field">
            <span className="label">Paciente</span>
            {paciente ? (
              <div className="row">
                <strong>{paciente.nome}</strong>
                {!pacienteId && (
                  <Button variante="ghost" pequeno onClick={() => setPaciente(null)}>
                    Trocar
                  </Button>
                )}
              </div>
            ) : (
              <>
                <input
                  className="input"
                  type="search"
                  placeholder="Nome, CPF ou telefone"
                  aria-label="Buscar paciente"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                />
                {resultados.data?.itens.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="btn sm"
                    style={{ justifyContent: 'flex-start' }}
                    onClick={() => setPaciente({ id: p.id, nome: p.nome })}
                  >
                    {p.nome}
                  </button>
                ))}
                {resultados.data && !resultados.data.itens.length && (
                  <span className="hint">Nenhum paciente encontrado.</span>
                )}
              </>
            )}
          </div>
        ) : (
          <div className="form-grid">
            <label className="field">
              <span className="label">Caderno do cliente</span>
              <select
                className="select"
                value={cliente}
                onChange={(e) => setCliente(e.target.value)}
              >
                <option value="">Selecione…</option>
                {clientes
                  ?.filter((c) => c.tipo === 'externo')
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.razao_social}
                    </option>
                  ))}
              </select>
            </label>
            <label className="field">
              <span className="label">Paciente (nome)</span>
              <input
                className="input"
                maxLength={120}
                value={pacienteNome}
                onChange={(e) => setPacienteNome(e.target.value)}
              />
            </label>
          </div>
        )}

        <div className="form-grid">
          <label className="field">
            <span className="label">Tipo de trabalho</span>
            <input
              className="input"
              list="os-tipos"
              maxLength={120}
              placeholder="Ex.: Coroa de zircônia"
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
            />
            <datalist id="os-tipos">
              {sugestoes.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </label>
          <label className="field">
            <span className="label">Elementos (FDI)</span>
            <input
              className="input"
              placeholder="Ex.: 46 ou 12, 22"
              inputMode="numeric"
              aria-invalid={lista === null}
              value={elementos}
              onChange={(e) => setElementos(e.target.value)}
            />
            {lista === null && <span className="error">Use a numeração FDI (11–48 ou 51–85).</span>}
          </label>
          <label className="field">
            <span className="label">Cor</span>
            <input
              className="input"
              maxLength={30}
              placeholder="Ex.: A2"
              value={cor}
              onChange={(e) => setCor(e.target.value)}
            />
          </label>
          <label className="field">
            <span className="label">Material</span>
            <input
              className="input"
              maxLength={80}
              value={material}
              onChange={(e) => setMaterial(e.target.value)}
            />
          </label>
          {propria ? (
            <label className="field">
              <span className="label">Dentista</span>
              <select
                className="select"
                value={profissional}
                onChange={(e) => setProfissional(e.target.value)}
              >
                <option value="">Eu mesmo(a)</option>
                {profs.data?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="field">
              <span className="label">Dentista (nome)</span>
              <input
                className="input"
                maxLength={120}
                value={dentistaNome}
                onChange={(e) => setDentistaNome(e.target.value)}
              />
            </label>
          )}
          <label className="field">
            <span className="label">Previsão de entrega</span>
            <input
              className="input"
              type="date"
              min={hoje()}
              value={previsao}
              onChange={(e) => setPrevisao(e.target.value)}
            />
          </label>
        </div>
        {propria && (
          <span className="hint">Laboratório de destino: {NOME_LABORATORIO.proprio}.</span>
        )}
        <label className="field">
          <span className="label">Observações para o laboratório</span>
          <textarea
            className="textarea"
            maxLength={2000}
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
          />
        </label>
      </div>
    </Overlay>
  );
}
