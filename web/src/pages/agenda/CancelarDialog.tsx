import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { api, chamar, mensagemDeErro } from '../../api/client';
import { Button } from '../../components/Button';
import { Campo } from '../../components/Campo';
import { Overlay } from '../../components/Overlay';
import { useToast } from '../../toast/useToast';

const schema = z.object({
  motivo: z.string().trim().min(3, 'Informe o motivo (mín. 3 caracteres).').max(300),
});

export function CancelarDialog({
  id,
  aoConcluir,
  onFechar,
}: {
  id: string;
  aoConcluir?: () => void;
  onFechar: () => void;
}) {
  const qc = useQueryClient();
  const { avisar } = useToast();
  const [erro, setErro] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });

  const cancelar = useMutation({
    mutationFn: (motivo: string) =>
      chamar(api.POST('/consultas/{id}/cancelar', { params: { path: { id } }, body: { motivo } })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['consultas'] });
      qc.invalidateQueries({ queryKey: ['consulta'] });
      qc.invalidateQueries({ queryKey: ['paciente'] });
      avisar('Consulta cancelada. O horário foi liberado.', 'ok');
      onFechar();
      aoConcluir?.();
    },
    onError: (e) => setErro(mensagemDeErro(e)),
  });

  return (
    <Overlay
      titulo="Cancelar consulta"
      descricao="O horário volta a ficar livre na agenda."
      onFechar={onFechar}
      rodape={
        <>
          <Button variante="secondary" onClick={onFechar}>
            Voltar
          </Button>
          <Button
            variante="danger"
            type="submit"
            form="form-cancelar"
            carregando={cancelar.isPending}
          >
            Cancelar consulta
          </Button>
        </>
      }
    >
      <form
        id="form-cancelar"
        noValidate
        className="stack"
        onSubmit={handleSubmit((d) => {
          setErro(null);
          cancelar.mutate(d.motivo);
        })}
      >
        {erro && (
          <div className="alert" role="alert">
            {erro}
          </div>
        )}
        <Campo label="Motivo do cancelamento" erro={errors.motivo?.message}>
          {(p) => <textarea {...p} {...register('motivo')} className="textarea" />}
        </Campo>
      </form>
    </Overlay>
  );
}
