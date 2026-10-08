import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { paginaInicial } from './auth/permissoes';
import { RotaProtegida } from './auth/RotaProtegida';
import { useAuth } from './auth/useAuth';
import { Carregando } from './components/Feedback';
import { AppShell } from './layout/AppShell';
import { EsqueciSenhaPage } from './pages/EsqueciSenhaPage';
import { LabPage } from './pages/LabPage';
import { LoginPage } from './pages/LoginPage';
import { PacientesPage } from './pages/pacientes/PacientesPage';
import { RedefinirSenhaPage } from './pages/RedefinirSenhaPage';

const AgendaPage = lazy(() =>
  import('./pages/agenda/AgendaPage').then((m) => ({ default: m.AgendaPage })),
);
const QuadroPage = lazy(() =>
  import('./pages/agenda/QuadroPage').then((m) => ({ default: m.QuadroPage })),
);
const AdminPage = lazy(() =>
  import('./pages/admin/AdminPage').then((m) => ({ default: m.AdminPage })),
);
const FichaPage = lazy(() =>
  import('./pages/pacientes/FichaPage').then((m) => ({ default: m.FichaPage })),
);

function Inicio() {
  const { usuario } = useAuth();
  return <Navigate to={usuario ? paginaInicial(usuario.perfil) : '/login'} replace />;
}

export function App() {
  return (
    <Suspense fallback={<Carregando />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/esqueci-senha" element={<EsqueciSenhaPage />} />
        <Route path="/redefinir-senha/:token" element={<RedefinirSenhaPage />} />

        <Route element={<RotaProtegida />}>
          <Route path="/" element={<Inicio />} />
          <Route element={<AppShell />}>
            <Route element={<RotaProtegida perfis={['secretaria', 'clinica']} />}>
              <Route path="/agenda" element={<AgendaPage />} />
              <Route path="/agenda/quadro" element={<QuadroPage />} />
              <Route path="/pacientes" element={<PacientesPage />} />
              <Route path="/pacientes/:id" element={<FichaPage />} />
            </Route>
            <Route element={<RotaProtegida perfis={['adm_clinica']} />}>
              <Route path="/admin/clinica" element={<AdminPage unidade="clinica" />} />
            </Route>
            <Route element={<RotaProtegida perfis={['adm_laboratorio']} />}>
              <Route path="/admin/lab" element={<AdminPage unidade="laboratorio" />} />
            </Route>
            <Route element={<RotaProtegida perfis={['laboratorio']} />}>
              <Route path="/lab" element={<LabPage />} />
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<Inicio />} />
      </Routes>
    </Suspense>
  );
}
