import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { api, chamar, mensagemDeErro } from '../../api/client';
import type { PacienteEntrada, PacienteFicha } from '../../api/types';
import { Chip } from '../../components/Chip';
import { IconeAgenda, IconeCheck } from '../../components/Icones';
import { Overlay } from '../../components/Overlay';
import { Seg } from '../../components/Seg';
import { cpfValido, mascaraCelular, mascaraCep, mascaraCpf, soDigitos } from '../../lib/mascaras';
import { idade } from '../../lib/pessoa';
import { useToast } from '../../toast/useToast';

const ORIGENS = ['Indicação', 'Instagram', 'Google', 'Outro'];
const celularOk = (v: string) => [10, 11].includes(soDigitos(v).length);

/**
 * Regras do cadastro (prancha "Novo paciente" + RN-001):
 * nome, nascimento e celular obrigatórios; CPF válido — ou, sem CPF, o responsável.
 * Na edição, CPF e celulares chegam mascarados: campo vazio significa "manter".
 */
function criarSchema(editando: boolean) {
  return z
    .object({
      nome: z.string().trim().min(2, 'Informe o nome completo.').max(120),
      cpf: z.string().refine((v) => v === '' || cpfValido(v), 'CPF inválido.'),
      nascimento: z
        .string()
        .refine((v) => editando || v !== '', 'Informe a data de nascimento.')
        .refine((v) => v === '' || new Date(v) <= new Date(), 'A data não pode ser futura.'),
      sexo: z.enum(['', 'F', 'M', 'O']),
      celular: z
        .string()
        .refine((v) => editando || v !== '', 'Informe o celular.')
        .refine((v) => v === '' || celularOk(v), 'Informe DDD e 10 ou 11 dígitos.'),
      email: z
        .string()
        .refine((v) => v === '' || z.string().email().safeParse(v).success, 'E-mail inválido.'),
      cep: z.string(),
      logradouro: z.string().max(120),
      origem: z.string().max(60),
      responsavel_nome: z.string().max(120),
      responsavel_parentesco: z.string().max(40),
      responsavel_celular: z
        .string()
        .refine((v) => v === '' || celularOk(v), 'Informe DDD e 10 ou 11 dígitos.'),
      observacoes: z.string().max(2000),
      lgpd: z.boolean(),
    })
    .superRefine((d, ctx) => {
      if (!editando && d.cpf === '' && d.responsavel_nome.trim().length < 2) {
        ctx.addIssue({
          code: 'custom',
          path: ['responsavel_nome'],
          message: 'Sem CPF, informe o responsável.',
        });
      }
    });
}
type Form = z.infer<ReturnType<typeof criarSchema>>;

const vazio = (v: string) => (v.trim() === '' ? null : v.trim());

function valoresIniciais(p?: PacienteFicha): Form {
  return {
    nome: p?.nome ?? '',
    cpf: '',
    nascimento: p?.nascimento ?? '',
    sexo: p?.sexo ?? '',
    celular: '',
    email: p?.email ?? '',
    cep: p?.endereco?.cep ?? '',
    logradouro: p?.endereco?.logradouro ?? '',
    origem: p?.origem ?? '',
    responsavel_nome: p?.responsavel?.nome ?? '',
    responsavel_parentesco: p?.responsavel?.parentesco ?? '',
    responsavel_celular: '',
    observacoes: p?.observacoes ?? '',
    lgpd: false,
  };
}

interface Props {
  paciente?: PacienteFicha;
  onFechar: () => void;
  /** agendar = true quando o usuário escolheu "Salvar e agendar consulta". */
  aoSalvar?: (id: string, agendar: boolean) => void;
}

export function PacienteForm({ paciente, onFechar, aoSalvar }: Props) {
  const editando = Boolean(paciente);
  const qc = useQueryClient();
  const { avisar } = useToast();
  const [erro, setErro] = useState<string | null>(null);
  const agendarDepois = useRef(false);
  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors, dirtyFields },
  } = useForm<Form>({
    resolver: zodResolver(criarSchema(editando)),
    defaultValues: valoresIniciais(paciente),
  });

  const [cpf, nascimento, sexo, origem, respNome] = useWatch({
    control,
    name: ['cpf', 'nascimento', 'sexo', 'origem', 'responsavel_nome'],
  });
  const anos = idade(nascimento || null);
  const menor = anos !== null && anos < 18;
  const semCpf = !editando ? cpf === '' : !paciente?.cpf && cpf === '';
  const mostraResponsavel = menor || semCpf || respNome !== '';

  const salvar = useMutation({
    mutationFn: async (d: Form) => {
      const endereco =
        d.cep.trim() || d.logradouro.trim()
          ? { ...(paciente?.endereco ?? {}), cep: d.cep.trim(), logradouro: d.logradouro.trim() }
          : null;
      const completo: PacienteEntrada = {
        nome: d.nome.trim(),
        cpf: d.cpf ? soDigitos(d.cpf) : null,
        nascimento: vazio(d.nascimento),
        sexo: d.sexo === '' ? null : d.sexo,
        celular: d.celular ? soDigitos(d.celular) : null,
        email: vazio(d.email),
        endereco,
        responsavel_nome: vazio(d.responsavel_nome),
        responsavel_parentesco: vazio(d.responsavel_parentesco),
        responsavel_celular: d.responsavel_celular ? soDigitos(d.responsavel_celular) : null,
        origem: vazio(d.origem),
        observacoes: vazio(d.observacoes),
      };
      if (!paciente) {
        const criado = await chamar(api.POST('/pacientes', { body: completo }));
        if (d.lgpd) {
          await chamar(
            api.POST('/pacientes/{id}/consentimento', {
              params: { path: { id: criado.id } },
              body: {
                finalidade: 'Tratamento dos dados pessoais para atendimento odontológico',
                forma: 'presencial',
              },
            }),
          );
        }
        return criado;
      }
      // Edição: só vai o que foi alterado (CPF e celulares só se redigitados).
      const body: PacienteEntrada = { nome: completo.nome };
      const enviar = <K extends keyof PacienteEntrada>(k: K, campos: (keyof Form)[]) => {
        if (campos.some((c) => dirtyFields[c])) body[k] = completo[k];
      };
      enviar('cpf', ['cpf']);
      enviar('nascimento', ['nascimento']);
      enviar('sexo', ['sexo']);
      enviar('celular', ['celular']);
      enviar('email', ['email']);
      enviar('origem', ['origem']);
      enviar('observacoes', ['observacoes']);
      enviar('responsavel_nome', ['responsavel_nome']);
      enviar('responsavel_parentesco', ['responsavel_parentesco']);
      enviar('responsavel_celular', ['responsavel_celular']);
      enviar('endereco', ['cep', 'logradouro']);
      return chamar(api.PATCH('/pacientes/{id}', { params: { path: { id: paciente.id } }, body }));
    },
    onSuccess: (salvo) => {
      qc.invalidateQueries({ queryKey: ['pacientes'] });
      qc.invalidateQueries({ queryKey: ['paciente', salvo.id] });
      avisar(editando ? 'Cadastro atualizado.' : 'Paciente cadastrado.', 'ok');
      onFechar();
      aoSalvar?.(salvo.id, agendarDepois.current);
    },
    onError: (e) => setErro(mensagemDeErro(e)),
  });

  const enviar = (agendar: boolean) =>
    handleSubmit((d) => {
      agendarDepois.current = agendar;
      setErro(null);
      salvar.mutate(d);
    })();

  const mantido = (valor: string | null | undefined) =>
    editando && valor ? `Mantido: ${valor} — digite para trocar` : undefined;
  const campoErro = (m?: string) =>
    m ? (
      <span className="error" role="alert">
        {m}
      </span>
    ) : null;

  return (
    <Overlay
      tipo="drawer"
      titulo={editando ? 'Editar paciente' : 'Novo paciente'}
      descricao={
        editando
          ? `Prontuário ${String(paciente!.numero_prontuario).padStart(5, '0')}`
          : 'O nº de prontuário é gerado ao salvar.'
      }
      onFechar={onFechar}
      rodape={
        <>
          <button type="button" className="btn" style={{ marginRight: 'auto' }} onClick={onFechar}>
            Cancelar
          </button>
          {!editando && (
            <button
              type="button"
              className="btn sec"
              disabled={salvar.isPending}
              onClick={() => enviar(true)}
            >
              <IconeAgenda />
              Salvar e agendar consulta
            </button>
          )}
          <button
            type="button"
            className="btn pri"
            disabled={salvar.isPending}
            onClick={() => enviar(false)}
          >
            <IconeCheck />
            {salvar.isPending ? 'Aguarde…' : 'Salvar paciente'}
          </button>
        </>
      }
    >
      <form
        noValidate
        className="stack"
        style={{ gap: 14 }}
        onSubmit={(e) => {
          e.preventDefault();
          enviar(false);
        }}
      >
        {erro && (
          <div className="alert" role="alert">
            {erro}
          </div>
        )}

        <div className="sec-titulo">Identificação</div>
        <div className="field">
          <label htmlFor="pf-nome">
            Nome completo <span style={{ color: 'var(--danger)' }}>*</span>
          </label>
          <input
            id="pf-nome"
            {...register('nome')}
            className="inp"
            autoComplete="off"
            aria-invalid={Boolean(errors.nome)}
          />
          {campoErro(errors.nome?.message)}
        </div>
        <div className="form-grid">
          <div className="field">
            <div className="row" style={{ justifyContent: 'space-between', gap: 6 }}>
              <label htmlFor="pf-cpf">CPF</label>
              {cpf !== '' && cpfValido(cpf) && (
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ok-ink)' }}>
                  ✓ CPF válido
                </span>
              )}
            </div>
            <input
              id="pf-cpf"
              {...register('cpf', {
                onChange: (e) => setValue('cpf', mascaraCpf(e.target.value), { shouldDirty: true }),
              })}
              className="inp"
              inputMode="numeric"
              placeholder="000.000.000-00"
              autoComplete="off"
              aria-invalid={Boolean(errors.cpf)}
            />
            {campoErro(errors.cpf?.message) ??
              (mantido(paciente?.cpf) && <span className="hint">{mantido(paciente?.cpf)}</span>)}
          </div>
          <div className="field">
            <div className="row" style={{ justifyContent: 'space-between', gap: 6 }}>
              <label htmlFor="pf-nasc">
                Nascimento {!editando && <span style={{ color: 'var(--danger)' }}>*</span>}
              </label>
              {anos !== null && (
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-3)' }}>
                  {anos} anos · {menor ? 'menor: informe o responsável' : 'sem responsável legal'}
                </span>
              )}
            </div>
            <input
              id="pf-nasc"
              {...register('nascimento')}
              type="date"
              className="inp"
              aria-invalid={Boolean(errors.nascimento)}
            />
            {campoErro(errors.nascimento?.message)}
          </div>
        </div>
        <div className="field">
          <span className="flabel">Sexo</span>
          <div>
            <Seg
              rotulo="Sexo"
              valor={sexo}
              onMudar={(v) => setValue('sexo', sexo === v ? '' : v, { shouldDirty: true })}
              opcoes={[
                { valor: 'M', rotulo: 'Masculino' },
                { valor: 'F', rotulo: 'Feminino' },
                { valor: 'O', rotulo: 'Outro' },
              ]}
            />
          </div>
        </div>

        {mostraResponsavel && (
          <>
            <div className="sec-titulo">Responsável</div>
            <div className="field">
              <label htmlFor="pf-resp">Nome do responsável</label>
              <input
                id="pf-resp"
                {...register('responsavel_nome')}
                className="inp"
                aria-invalid={Boolean(errors.responsavel_nome)}
              />
              {campoErro(errors.responsavel_nome?.message)}
            </div>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="pf-parent">Parentesco</label>
                <input id="pf-parent" {...register('responsavel_parentesco')} className="inp" />
              </div>
              <div className="field">
                <label htmlFor="pf-respcel">Celular do responsável</label>
                <input
                  id="pf-respcel"
                  {...register('responsavel_celular', {
                    onChange: (e) =>
                      setValue('responsavel_celular', mascaraCelular(e.target.value), {
                        shouldDirty: true,
                      }),
                  })}
                  className="inp"
                  type="tel"
                  inputMode="tel"
                  placeholder="(00) 00000-0000"
                  aria-invalid={Boolean(errors.responsavel_celular)}
                />
                {campoErro(errors.responsavel_celular?.message) ??
                  (mantido(paciente?.responsavel?.celular) && (
                    <span className="hint">{mantido(paciente?.responsavel?.celular)}</span>
                  ))}
              </div>
            </div>
          </>
        )}

        <div className="sec-titulo">Contato e endereço</div>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="pf-cel">
              Celular / WhatsApp {!editando && <span style={{ color: 'var(--danger)' }}>*</span>}
            </label>
            <input
              id="pf-cel"
              {...register('celular', {
                onChange: (e) =>
                  setValue('celular', mascaraCelular(e.target.value), { shouldDirty: true }),
              })}
              className="inp"
              type="tel"
              inputMode="tel"
              placeholder="(00) 00000-0000"
              autoComplete="off"
              aria-invalid={Boolean(errors.celular)}
            />
            {campoErro(errors.celular?.message) ??
              (mantido(paciente?.celular) && (
                <span className="hint">{mantido(paciente?.celular)}</span>
              ))}
          </div>
          <div className="field">
            <label htmlFor="pf-email">E-mail</label>
            <input
              id="pf-email"
              {...register('email')}
              type="email"
              className="inp"
              placeholder="nome@email.com"
              autoComplete="off"
              aria-invalid={Boolean(errors.email)}
            />
            {campoErro(errors.email?.message)}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: 14 }}>
          <div className="field">
            <label htmlFor="pf-cep">CEP</label>
            <input
              id="pf-cep"
              {...register('cep', {
                onChange: (e) => setValue('cep', mascaraCep(e.target.value), { shouldDirty: true }),
              })}
              className="inp"
              inputMode="numeric"
              placeholder="00000-000"
            />
          </div>
          <div className="field">
            <label htmlFor="pf-end">Endereço</label>
            <input
              id="pf-end"
              {...register('logradouro')}
              className="inp"
              placeholder="Rua, número, bairro"
            />
          </div>
        </div>

        <div className="sec-titulo">Complementos</div>
        <div className="field">
          <span className="flabel">Como conheceu a clínica</span>
          <div className="row" style={{ gap: 8 }}>
            {ORIGENS.map((o) => (
              <Chip
                key={o}
                ativo={origem === o}
                onClick={() => setValue('origem', origem === o ? '' : o, { shouldDirty: true })}
              >
                {o}
              </Chip>
            ))}
          </div>
        </div>
        <div className="field">
          <label htmlFor="pf-obs">Observações</label>
          <textarea
            id="pf-obs"
            {...register('observacoes')}
            className="inp"
            rows={3}
            placeholder="Preferências de horário, medo de anestesia, etc."
          />
        </div>

        {!editando && (
          <label
            className="check"
            style={{
              alignItems: 'flex-start',
              padding: '12px 14px',
              borderRadius: 12,
              background: 'var(--primary-soft)',
            }}
          >
            <input type="checkbox" {...register('lgpd')} style={{ marginTop: 2 }} />
            <span>
              <b style={{ display: 'block', color: 'var(--primary-ink)' }}>
                Paciente autorizou o tratamento dos dados pessoais
              </b>
              <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>
                LGPD · o aceite fica registrado com data, hora e usuário.
              </span>
            </span>
          </label>
        )}
      </form>
    </Overlay>
  );
}
