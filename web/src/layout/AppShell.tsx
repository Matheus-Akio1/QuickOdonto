import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { menuDoPerfil, NOME_PERFIL, type ItemMenu } from '../auth/permissoes';
import { Button } from '../components/Button';
import {
  IconeAgenda,
  IconeDente,
  IconePacientes,
  IconeQuadro,
  IconeSair,
  IconeUsuarios,
} from '../components/Icones';
import { Notificacoes } from './Notificacoes';

const ICONES: Record<ItemMenu['icone'], () => React.JSX.Element> = {
  agenda: IconeAgenda,
  quadro: IconeQuadro,
  pacientes: IconePacientes,
  usuarios: IconeUsuarios,
  dente: IconeDente,
};

export function AppShell() {
  const { usuario, sair } = useAuth();
  const navegar = useNavigate();
  if (!usuario) return null;

  return (
    <div className="shell">
      <aside className="sidebar">
        <span className="brand">
          <span className="brand-mark" aria-hidden="true">
            Q
          </span>
          QuickOdonto
        </span>
        <nav className="nav" aria-label="Principal">
          <span className="nav-titulo">{NOME_PERFIL[usuario.perfil]}</span>
          {menuDoPerfil(usuario.perfil).map((item) => {
            const Icone = ICONES[item.icone];
            return (
              <NavLink key={item.rota} to={item.rota} end>
                <Icone />
                {item.rotulo}
              </NavLink>
            );
          })}
        </nav>
        <div className="side-foot">
          <strong>{usuario.nome}</strong>
          <span>{NOME_PERFIL[usuario.perfil]}</span>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <span className="grow muted">
            {usuario.unidade === 'clinica' ? 'Clínica' : 'Laboratório'}
          </span>
          <Notificacoes />
          <Button
            variante="ghost"
            onClick={async () => {
              await sair();
              navegar('/login', { replace: true });
            }}
          >
            <IconeSair /> Sair
          </Button>
        </header>
        <main>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
