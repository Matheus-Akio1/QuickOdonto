import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { api, chamar, mensagemDeErro } from '../api/client';
import { Button } from '../components/Button';
import { Campo } from '../components/Campo';
import { PaginaAuth } from './LoginPage';

const schema = z.object({
  email: z.string().min(1, 'Informe o e-mail.').email('E-mail inválido.'),
});

export function EsqueciSenhaPage() {
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });

  const enviar = handleSubmit(async ({ email }) => {
    setErro(null);
    try {
      await chamar(api.POST('/auth/esqueci-senha', { body: { email } }));
      setEnviado(true);
    } catch (e) {
      setErro(mensagemDeErro(e));
    }
  });

  return (
    <PaginaAuth>
      <div className="stack">
        <div>
          <h2>Recuperar senha</h2>
          <p className="muted">Enviaremos um link de uso único, com validade curta.</p>
        </div>
        {enviado ? (
          <div className="alert ok" role="status">
            Se o e-mail estiver cadastrado, o link de redefinição foi enviado. Confira sua caixa de
            entrada.
          </div>
        ) : (
          <form onSubmit={enviar} className="stack" noValidate>
            {erro && (
              <div className="alert" role="alert">
                {erro}
              </div>
            )}
            <Campo label="E-mail" erro={errors.email?.message}>
              {(p) => (
                <input
                  {...p}
                  {...register('email')}
                  type="email"
                  autoComplete="email"
                  className="input"
                />
              )}
            </Campo>
            <Button type="submit" carregando={isSubmitting}>
              Enviar link
            </Button>
          </form>
        )}
        <Link to="/login">Voltar para o login</Link>
      </div>
    </PaginaAuth>
  );
}
