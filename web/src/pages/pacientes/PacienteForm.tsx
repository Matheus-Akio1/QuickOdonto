import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { api, chamar, mensagemDeErro } from '../../api/client';
import type { PacienteEntrada, PacienteFicha } from '../../api/types';
import { Button } from '../../components/Button';
import { Campo } from '../../components/Campo';
import { Overlay } from '../../components/Overlay';
import { cpfValido, mascaraCelular, mascaraCep, mascaraCpf, soDigitos } from '../../lib/mascaras';
import { useToast } from '../../toast/useToast';

const celular = z
  .string()
  .refine(
    (v) => v === '' || [10, 11].includes(soDigitos(v).length),
    'Informe DDD e 10 ou 11 dígitos.',
  );

// Espelha as regras do backend (RN-001): CPF válido; sem CPF, o responsável é obrigatório.
const schema = z
  .object({
    nome: z.string().trim().min(2, 'Informe o nome completo.').max(120),
    cpf: z.string().refine((v) => v === '' || cpfValido(v), 'CPF inválido.'),
    nascimento: z
      .string()
      .refine((v) => v === '' || new Date(v) <= new Date(), 'A data não pode ser futura.'),
    sexo: z.enum(['', 'F', 'M', 'O']),
    celular,
    email: z
      .string()
      .refine((v) => v === '' || z.string().email().safeParse(v).success, 'E-mail inválido.'),
    origem: z.string().max(60),
    cep: z.string(),
    logradouro: z.string().max(120),
    numero: z.string().max(15),
    complemento: z.string().max(60),
    bairro: z.string().max(80),
    cidade: z.string().max(80),
    uf: z.string().max(2),
    responsavel_nome: z.string().max(120),
    responsavel_parentesco: z.string().max(40),
    responsavel_celular: celular,
    observacoes: z.string().max(2000),
  })
  .superRefine((d, ctx) => {
    if (d.cpf === '' && d.responsavel_nome.trim().length < 2) {
      ctx.addIssue({
        code: 'custom',
        path: ['responsavel_nome'],
        message: 'Sem CPF, informe o responsável.',
      });
    }
  });
type Form = z.infer<typeof schema>;

const vazio = (v: string) => (v.trim() === '' ? null : v.trim());

function valoresIniciais(p?: PacienteFicha): Form {
  return {
    nome: p?.nome ?? '',
    cpf: '',
    nascimento: p?.nascimento ?? '',
    sexo: p?.sexo ?? '',
    celular: '',
    email: p?.email ?? '',
    origem: p?.origem ?? '',
    cep: p?.endereco?.cep ?? '',
    logradouro: p?.endereco?.logradouro ?? '',
    numero: p?.endereco?.numero ?? '',
    complemento: p?.endereco?.complemento ?? '',
    bairro: p?.endereco?.bairro ?? '',
    cidade: p?.endereco?.cidade ?? '',
    uf: p?.endereco?.uf ?? '',
    responsavel_nome: p?.responsavel?.nome ?? '',
    responsavel_parentesco: p?.responsavel?.parentesco ?? '',
    responsavel_celular: '',
    observacoes: p?.observacoes ?? '',
  };
}

function paraPayload(d: Form): PacienteEntrada {
  const end = {
    cep: vazio(d.cep),
    logradouro: vazio(d.logradouro),
    numero: vazio(d.numero),
    complemento: vazio(d.complemento),
    bairro: vazio(d.bairro),
    cidade: vazio(d.cidade),
    uf: vazio(d.uf)?.toUpperCase() ?? null,
  };
  const temEndereco = Object.values(end).some(Boolean);
  return {
    nome: d.nome.trim(),
    cpf: d.cpf ? soDigitos(d.cpf) : null,
    nascimento: vazio(d.nascimento),
    sexo: d.sexo === '' ? null : d.sexo,
    celular: d.celular ? soDigitos(d.celular) : null,
    email: vazio(d.email),
    endereco: temEndereco
      ? (Object.fromEntries(
          Object.entries(end).filter(([, v]) => v),
        ) as PacienteEntrada['endereco'])
      : null,
    responsavel_nome: vazio(d.responsavel_nome),
    responsavel_parentesco: vazio(d.responsavel_parentesco),
    responsavel_celular: d.responsavel_celular ? soDigitos(d.responsavel_celular) : null,
    origem: vazio(d.origem),
    observacoes: vazio(d.observacoes),
  };
}

interface Props {
  paciente?: PacienteFicha;
  onFechar: () => void;
  aoSalvar?: (id: string) => void;
}

export function PacienteForm({ paciente, onFechar, aoSalvar }: Props) {
  const editando = Boolean(paciente);
  const qc = useQueryClient();
  const { avisar } = useToast();
  const [erro, setErro] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, dirtyFields },
  } = useForm<Form>({ resolver: zodResolver(schema), defaultValues: valoresIniciais(paciente) });

  const salvar = useMutation({
    mutationFn: async (d: Form) => {
      const completo = paraPayload(d);
      if (!paciente) return chamar(api.POST('/pacientes', { body: completo }));
      // Edição: CPF e celulares chegam mascarados, então só são enviados se forem digitados de novo.
      const body: PacienteEntrada = { nome: completo.nome };
      const enviar = <K extends keyof PacienteEntrada>(
        k: K,
        campo: keyof Form | (keyof Form)[],
      ) => {
        const campos = Array.isArray(campo) ? campo : [campo];
        if (campos.some((c) => dirtyFields[c])) body[k] = completo[k];
      };
      enviar('cpf', 'cpf');
      enviar('nascimento', 'nascimento');
      enviar('sexo', 'sexo');
      enviar('celular', 'celular');
      enviar('email', 'email');
      enviar('origem', 'origem');
      enviar('observacoes', 'observacoes');
      enviar('responsavel_nome', 'responsavel_nome');
      enviar('responsavel_parentesco', 'responsavel_parentesco');
      enviar('responsavel_celular', 'responsavel_celular');
      enviar('endereco', ['cep', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'uf']);
      return chamar(api.PATCH('/pacientes/{id}', { params: { path: { id: paciente.id } }, body }));
    },
    onSuccess: (salvo) => {
      qc.invalidateQueries({ queryKey: ['pacientes'] });
      qc.invalidateQueries({ queryKey: ['paciente', salvo.id] });
      avisar(editando ? 'Cadastro atualizado.' : 'Paciente cadastrado.', 'ok');
      onFechar();
      aoSalvar?.(salvo.id);
    },
    onError: (e) => setErro(mensagemDeErro(e)),
  });

  const enviar = handleSubmit((d) => {
    setErro(null);
    salvar.mutate(d);
  });

  const mascarado = (valor: string | null | undefined, rotulo: string) =>
    editando && valor ? `Mantido: ${valor} — digite para trocar` : rotulo;

  return (
    <Overlay
      tipo="drawer"
      titulo={editando ? 'Editar paciente' : 'Novo paciente'}
      descricao="Sem CPF, é obrigatório informar o responsável."
      onFechar={onFechar}
      rodape={
        <>
          <Button variante="secondary" onClick={onFechar}>
            Cancelar
          </Button>
          <Button type="submit" form="form-paciente" carregando={salvar.isPending}>
            Salvar
          </Button>
        </>
      }
    >
      <form id="form-paciente" onSubmit={enviar} noValidate className="stack">
        {erro && (
          <div className="alert" role="alert">
            {erro}
          </div>
        )}
        <div className="form-grid">
          <Campo className="full" label="Nome completo *" erro={errors.nome?.message}>
            {(p) => <input {...p} {...register('nome')} className="input" autoComplete="off" />}
          </Campo>
          <Campo label="CPF" erro={errors.cpf?.message} dica={mascarado(paciente?.cpf, '')}>
            {(p) => (
              <input
                {...p}
                {...register('cpf', {
                  onChange: (e) =>
                    setValue('cpf', mascaraCpf(e.target.value), { shouldDirty: true }),
                })}
                className="input"
                inputMode="numeric"
                placeholder="000.000.000-00"
                autoComplete="off"
              />
            )}
          </Campo>
          <Campo label="Nascimento" erro={errors.nascimento?.message}>
            {(p) => <input {...p} {...register('nascimento')} type="date" className="input" />}
          </Campo>
          <Campo
            label="Celular"
            erro={errors.celular?.message}
            dica={mascarado(paciente?.celular, '')}
          >
            {(p) => (
              <input
                {...p}
                {...register('celular', {
                  onChange: (e) =>
                    setValue('celular', mascaraCelular(e.target.value), { shouldDirty: true }),
                })}
                className="input"
                type="tel"
                inputMode="tel"
                placeholder="(00) 00000-0000"
                autoComplete="off"
              />
            )}
          </Campo>
          <Campo label="Sexo" erro={errors.sexo?.message}>
            {(p) => (
              <select {...p} {...register('sexo')} className="select">
                <option value="">Não informado</option>
                <option value="F">Feminino</option>
                <option value="M">Masculino</option>
                <option value="O">Outro</option>
              </select>
            )}
          </Campo>
          <Campo className="full" label="E-mail" erro={errors.email?.message}>
            {(p) => (
              <input
                {...p}
                {...register('email')}
                type="email"
                className="input"
                autoComplete="off"
              />
            )}
          </Campo>
          <Campo className="full" label="Como conheceu a clínica" erro={errors.origem?.message}>
            {(p) => (
              <input
                {...p}
                {...register('origem')}
                className="input"
                placeholder="Indicação, Instagram, Google…"
              />
            )}
          </Campo>
        </div>

        <h3>Endereço</h3>
        <div className="form-grid">
          <Campo label="CEP">
            {(p) => (
              <input
                {...p}
                {...register('cep', {
                  onChange: (e) =>
                    setValue('cep', mascaraCep(e.target.value), { shouldDirty: true }),
                })}
                className="input"
                inputMode="numeric"
              />
            )}
          </Campo>
          <Campo label="Número">
            {(p) => <input {...p} {...register('numero')} className="input" />}
          </Campo>
          <Campo className="full" label="Logradouro">
            {(p) => <input {...p} {...register('logradouro')} className="input" />}
          </Campo>
          <Campo label="Complemento">
            {(p) => <input {...p} {...register('complemento')} className="input" />}
          </Campo>
          <Campo label="Bairro">
            {(p) => <input {...p} {...register('bairro')} className="input" />}
          </Campo>
          <Campo label="Cidade">
            {(p) => <input {...p} {...register('cidade')} className="input" />}
          </Campo>
          <Campo label="UF">
            {(p) => <input {...p} {...register('uf')} className="input" maxLength={2} />}
          </Campo>
        </div>

        <h3>Responsável</h3>
        <div className="form-grid">
          <Campo
            className="full"
            label="Nome do responsável"
            erro={errors.responsavel_nome?.message}
          >
            {(p) => <input {...p} {...register('responsavel_nome')} className="input" />}
          </Campo>
          <Campo label="Parentesco">
            {(p) => <input {...p} {...register('responsavel_parentesco')} className="input" />}
          </Campo>
          <Campo
            label="Celular do responsável"
            erro={errors.responsavel_celular?.message}
            dica={mascarado(paciente?.responsavel?.celular, '')}
          >
            {(p) => (
              <input
                {...p}
                {...register('responsavel_celular', {
                  onChange: (e) =>
                    setValue('responsavel_celular', mascaraCelular(e.target.value), {
                      shouldDirty: true,
                    }),
                })}
                className="input"
                type="tel"
                inputMode="tel"
              />
            )}
          </Campo>
        </div>

        <Campo label="Observações" erro={errors.observacoes?.message} dica="Armazenadas cifradas.">
          {(p) => <textarea {...p} {...register('observacoes')} className="textarea" />}
        </Campo>
      </form>
    </Overlay>
  );
}
