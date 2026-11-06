import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { paginaInicial } from './auth/permissoes';
import { RotaProtegida } from './auth/RotaProtegida';
import { useAuth } from './auth/useAuth';
import { Carregando } from './components/Feedback';
import { AppShell } from './layout/AppShell';
import { EsqueciSenhaPage } from './pages/EsqueciSenhaPage';
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
const ProntuarioPage = lazy(() =>
  import('./pages/clinica/ProntuarioPage').then((m) => ({ default: m.ProntuarioPage })),
);
const AnamnesePage = lazy(() =>
  import('./pages/clinica/AnamnesePage').then((m) => ({ default: m.AnamnesePage })),
);
const CatalogoPage = lazy(() =>
  import('./pages/clinica/CatalogoPage').then((m) => ({ default: m.CatalogoPage })),
);
const SelecionarPacientePage = lazy(() =>
  import('./pages/clinica/SelecionarPacientePage').then((m) => ({
    default: m.SelecionarPacientePage,
  })),
);
const OrdensPage = lazy(() =>
  import('./pages/os/OrdensPage').then((m) => ({ default: m.OrdensPage })),
);
const ProducaoPage = lazy(() =>
  import('./pages/lab/ProducaoPage').then((m) => ({ default: m.ProducaoPage })),
);
const ClientesPage = lazy(() =>
  import('./pages/lab/ClientesPage').then((m) => ({ default: m.ClientesPage })),
);
const EstoquePage = lazy(() =>
  import('./pages/estoque/EstoquePage').then((m) => ({ default: m.EstoquePage })),
);
const FinanceiroPage = lazy(() =>
  import('./pages/financeiro/FinanceiroPage').then((m) => ({ default: m.FinanceiroPage })),
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
            <Route element={<RotaProtegida perfis={['clinica']} />}>
              <Route
                path="/clinica/prontuario"
                element={<SelecionarPacientePage destino="prontuario" />}
              />
              <Route
                path="/clinica/anamnese"
                element={<SelecionarPacientePage destino="anamnese" />}
              />
              <Route path="/clinica/prontuario/:id" element={<ProntuarioPage />} />
              <Route path="/clinica/anamnese/:id" element={<AnamnesePage />} />
              <Route path="/clinica/procedimentos" element={<CatalogoPage />} />
            </Route>
            <Route element={<RotaProtegida perfis={['adm_clinica']} />}>
              <Route path="/admin/clinica" element={<AdminPage unidade="clinica" />} />
              <Route path="/admin/clinica/estoque" element={<EstoquePage />} />
              <Route path="/admin/clinica/financeiro" element={<FinanceiroPage />} />
            </Route>
            <Route element={<RotaProtegida perfis={['adm_laboratorio']} />}>
              <Route path="/admin/lab" element={<AdminPage unidade="laboratorio" />} />
              <Route path="/admin/lab/estoque" element={<EstoquePage />} />
              <Route path="/admin/lab/financeiro" element={<FinanceiroPage />} />
            </Route>
            <Route element={<RotaProtegida perfis={['secretaria']} />}>
              <Route path="/ordens-servico" element={<OrdensPage />} />
            </Route>
            <Route element={<RotaProtegida perfis={['laboratorio']} />}>
              <Route path="/lab" element={<Navigate to="/lab/producao" replace />} />
              <Route path="/lab/producao" element={<ProducaoPage />} />
              <Route path="/lab/clientes" element={<ClientesPage />} />
              <Route path="/lab/estoque" element={<EstoquePage />} />
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<Inicio />} />
      </Routes>
    </Suspense>
  );
}
