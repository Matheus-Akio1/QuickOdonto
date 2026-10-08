import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useParams } from 'react-router-dom';
import { z } from 'zod';
import { api, chamar, mensagemDeErro } from '../api/client';
import { Button } from '../components/Button';
import { Campo } from '../components/Campo';
import { PaginaAuth } from './LoginPage';

// Mesma política do backend: 10+ caracteres com minúscula, maiúscula e número.
const schema = z
  .object({
    novaSenha: z
      .string()
      .min(10, 'A senha deve ter ao menos 10 caracteres.')
      .regex(/[a-z]/, 'Inclua uma letra minúscula.')
      .regex(/[A-Z]/, 'Inclua uma letra maiúscula.')
      .regex(/[0-9]/, 'Inclua um número.'),
    confirmacao: z.string(),
  })
  .refine((d) => d.novaSenha === d.confirmacao, {
    path: ['confirmacao'],
    message: 'As senhas não conferem.',
  });

export function RedefinirSenhaPage() {
  const { token = '' } = useParams();
  const [ok, setOk] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });

  const enviar = handleSubmit(async ({ novaSenha }) => {
    setErro(null);
    try {
      await chamar(api.POST('/auth/redefinir-senha', { body: { token, novaSenha } }));
      setOk(true);
    } catch (e) {
      setErro(mensagemDeErro(e));
    }
  });

  return (
    <PaginaAuth>
      <div className="stack">
        <div>
          <h2>Definir nova senha</h2>
          <p className="muted">Use pelo menos 10 caracteres, com maiúscula, minúscula e número.</p>
        </div>
        {ok ? (
          <>
            <div className="alert ok" role="status">
              Senha definida. Você já pode entrar.
            </div>
            <Link className="btn" to="/login">
              Ir para o login
            </Link>
          </>
        ) : (
          <form onSubmit={enviar} className="stack" noValidate>
            {erro && (
              <div className="alert" role="alert">
                {erro}
              </div>
            )}
            <Campo label="Nova senha" erro={errors.novaSenha?.message}>
              {(p) => (
                <input
                  {...p}
                  {...register('novaSenha')}
                  type="password"
                  autoComplete="new-password"
                  className="input"
                />
              )}
            </Campo>
            <Campo label="Confirmar senha" erro={errors.confirmacao?.message}>
              {(p) => (
                <input
                  {...p}
                  {...register('confirmacao')}
                  type="password"
                  autoComplete="new-password"
                  className="input"
                />
              )}
            </Campo>
            <Button type="submit" carregando={isSubmitting}>
              Salvar senha
            </Button>
          </form>
        )}
      </div>
    </PaginaAuth>
  );
}
