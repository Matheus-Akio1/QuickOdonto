import { Navigate, Outlet, useLocation } from 'react-router-dom';
import type { Perfil } from '../api/types';
import { Carregando } from '../components/Feedback';
import { paginaInicial } from './permissoes';
import { useAuth } from './useAuth';

/** Navegação protegida (conveniência): sem sessão → /login; perfil errado → página inicial do perfil. */
export function RotaProtegida({ perfis }: { perfis?: Perfil[] }) {
  const { usuario, carregando } = useAuth();
  const local = useLocation();

  if (carregando) {
    return (
      <div className="page">
        <Carregando />
      </div>
    );
  }
  if (!usuario) return <Navigate to="/login" replace state={{ de: local.pathname }} />;
  if (perfis && !perfis.includes(usuario.perfil))
    return <Navigate to={paginaInicial(usuario.perfil)} replace />;
  return <Outlet />;
}
