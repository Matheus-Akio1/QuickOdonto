import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { mensagemDeErro } from '../api/client';
import { paginaInicial } from '../auth/permissoes';
import { useAuth } from '../auth/useAuth';
import { Button } from '../components/Button';
import { Campo } from '../components/Campo';

const schema = z.object({
  email: z.string().min(1, 'Informe o e-mail.').email('E-mail inválido.'),
  senha: z.string().min(1, 'Informe a senha.'),
});
type Form = z.infer<typeof schema>;

export function PaginaAuth({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-page">
      <section className="auth-art">
        <span className="brand">
          <span className="brand-mark" aria-hidden="true">
            Q
          </span>
          QuickOdonto
        </span>
        <div>
          <h1>Clínica e laboratório, no mesmo ritmo.</h1>
          <p>
            Agenda, pacientes e ordens de serviço num só lugar — com os dados sensíveis protegidos.
          </p>
        </div>
        <small>Seus dados ficam cifrados e cada acesso é registrado.</small>
      </section>
      <section className="auth-form-wrap">
        <div className="auth-form">{children}</div>
      </section>
    </div>
  );
}

export function LoginPage() {
  const { usuario, entrar, mensagemSessao } = useAuth();
  const navegar = useNavigate();
  const local = useLocation();
  const [erro, setErro] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Form>({ resolver: zodResolver(schema) });

  if (usuario) return <Navigate to={paginaInicial(usuario.perfil)} replace />;

  const enviar = handleSubmit(async ({ email, senha }) => {
    setErro(null);
    try {
      await entrar(email, senha);
      const destino = (local.state as { de?: string } | null)?.de;
      navegar(destino ?? '/', { replace: true });
    } catch (e) {
      setErro(mensagemDeErro(e));
    }
  });

  return (
    <PaginaAuth>
      <form onSubmit={enviar} className="stack" noValidate>
        <div>
          <h2>Entrar</h2>
          <p className="muted">Use o e-mail e a senha do seu cadastro.</p>
        </div>
        {mensagemSessao && <div className="alert info">{mensagemSessao}</div>}
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
              autoComplete="username"
              className="input"
            />
          )}
        </Campo>
        <Campo label="Senha" erro={errors.senha?.message}>
          {(p) => (
            <input
              {...p}
              {...register('senha')}
              type="password"
              autoComplete="current-password"
              className="input"
            />
          )}
        </Campo>
        <Button type="submit" carregando={isSubmitting}>
          Entrar
        </Button>
        <Link to="/esqueci-senha">Esqueci minha senha</Link>
      </form>
    </PaginaAuth>
  );
}
