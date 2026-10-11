import { zodResolver } from '@hookform/resolvers/zod';
import { useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { mensagemDeErro } from '../api/client';
import { paginaInicial } from '../auth/permissoes';
import { useAuth } from '../auth/useAuth';
import { Arcada } from '../components/Arcada';
import { Button } from '../components/Button';
import { IconeDente, IconeOlho } from '../components/Icones';

const schema = z.object({
  email: z.string().min(1, 'Informe o e-mail.').email('E-mail inválido.'),
  senha: z.string().min(1, 'Informe a senha.'),
});
type Form = z.infer<typeof schema>;

const DESTAQUES = [
  ['5 painéis', 'Acesso por perfil'],
  ['OS integrada', 'Clínica → laboratório'],
  ['LGPD', 'Acessos auditados'],
];

/** Moldura das telas de acesso, conforme a prancha "Entrar": painel petróleo + formulário. */
export function PaginaAuth({ children }: { children: ReactNode }) {
  return (
    <div className="app auth">
      <section className="auth-art">
        <div className="brand" style={{ padding: 0 }}>
          <div className="logo">
            <IconeDente tamanho={20} />
          </div>
          QuickOdonto
        </div>
        <div className="auth-ilustra">
          <div className="anel a1" />
          <div className="anel a2" />
          <Arcada />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <h1 className="disp auth-titulo">
            A clínica e o laboratório, no{' '}
            <span style={{ color: 'var(--peach)' }}>mesmo fluxo.</span>
          </h1>
          <p style={{ fontSize: 18, lineHeight: 1.5, color: '#BFD9D2', maxWidth: 460 }}>
            Agenda, prontuário, ordens de serviço, estoque e financeiro — cada perfil com o seu
            painel.
          </p>
        </div>
        <div className="auth-destaques">
          {DESTAQUES.map(([t, d]) => (
            <div key={t}>
              <span style={{ fontWeight: 700, color: '#fff', fontSize: 15 }}>{t}</span>
              <span style={{ fontSize: 13, color: '#BFD9D2' }}>{d}</span>
            </div>
          ))}
        </div>
      </section>
      <section className="auth-form-wrap">
        <div className="auth-form">{children}</div>
      </section>
    </div>
  );
}

export function TituloAuth({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <h2
        className="disp"
        style={{ fontSize: 36, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.05 }}
      >
        {titulo}
      </h2>
      <span style={{ fontSize: 15, color: 'var(--ink-3)' }}>{texto}</span>
    </div>
  );
}

export function LoginPage() {
  const { usuario, entrar, mensagemSessao } = useAuth();
  const navegar = useNavigate();
  const local = useLocation();
  const [erro, setErro] = useState<string | null>(null);
  const [verSenha, setVerSenha] = useState(false);
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
      <TituloAuth titulo="Entrar" texto="Use o e-mail e a senha cadastrados pelo administrador." />
      <form
        onSubmit={enviar}
        style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
        noValidate
      >
        {mensagemSessao && <div className="alert info">{mensagemSessao}</div>}
        {erro && (
          <div className="alert" role="alert">
            {erro}
          </div>
        )}
        <div className="field">
          <label htmlFor="em">E-mail</label>
          <input
            {...register('email')}
            id="em"
            className="inp"
            style={{ height: 48 }}
            type="email"
            placeholder="nome@clinica.com.br"
            autoComplete="username"
            aria-invalid={Boolean(errors.email)}
          />
          {errors.email && <span className="error">{errors.email.message}</span>}
        </div>
        <div className="field">
          <label htmlFor="pw">Senha</label>
          <div style={{ position: 'relative' }}>
            <input
              {...register('senha')}
              id="pw"
              className="inp"
              style={{ height: 48, paddingRight: 52 }}
              type={verSenha ? 'text' : 'password'}
              placeholder="••••••••"
              autoComplete="current-password"
              aria-invalid={Boolean(errors.senha)}
            />
            <button
              type="button"
              className="ibtn g"
              style={{ position: 'absolute', right: 4, top: 4, color: 'var(--ink-3)' }}
              aria-label={verSenha ? 'Ocultar senha' : 'Mostrar senha'}
              aria-pressed={verSenha}
              onClick={() => setVerSenha((v) => !v)}
            >
              <IconeOlho tamanho={20} />
            </button>
          </div>
          {errors.senha && <span className="error">{errors.senha.message}</span>}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
          <Link style={{ fontSize: 14, fontWeight: 600 }} to="/esqueci-senha">
            Esqueci minha senha
          </Link>
        </div>
        <Button
          type="submit"
          carregando={isSubmitting}
          style={{ height: 50, fontSize: 15, borderRadius: 13 }}
        >
          Entrar
        </Button>
      </form>
    </PaginaAuth>
  );
}
