import { useQuery } from '@tanstack/react-query';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { api, chamar } from '../api/client';
import {
  COR_PAINEL,
  menuDoPerfil,
  NOME_PAINEL,
  NOME_PERFIL,
  type ItemMenu,
} from '../auth/permissoes';
import { useAuth } from '../auth/useAuth';
import { Avatar } from '../components/Avatar';
import {
  IconeAgenda,
  IconeCoracao,
  IconeDente,
  IconeEscudo,
  IconeFrasco,
  IconePacientes,
  IconePasta,
  IconeQuadro,
  IconeSair,
  IconeSeletor,
} from '../components/Icones';
import { fmtDecorrido, hoje, isoLocal, somarDias } from '../lib/datas';

const ICONES: Record<ItemMenu['icone'], (p: { tamanho?: number }) => React.JSX.Element> = {
  pacientes: IconePacientes,
  agenda: IconeAgenda,
  quadro: IconeQuadro,
  prontuario: IconePasta,
  anamnese: IconeCoracao,
  procedimentos: IconeDente,
  usuarios: IconeEscudo,
  laboratorio: IconeFrasco,
};

/** Estrutura do protótipo: menu lateral petróleo (painel, menu, usuário) + área principal. */
export function AppShell() {
  const { usuario, sair } = useAuth();
  const navegar = useNavigate();

  // Quem já chegou e aguarda: selo do "Quadro do dia" (secretaria) e cartão "Na sala de espera" (dentista).
  const perfil = usuario?.perfil;
  const dia = hoje();
  const espera = useQuery({
    queryKey: ['consultas', 'espera', dia],
    enabled: perfil === 'secretaria' || perfil === 'clinica',
    refetchInterval: 60_000,
    queryFn: () =>
      chamar(
        api.GET('/consultas', {
          params: {
            query: {
              inicio: isoLocal(dia, '00:00'),
              fim: isoLocal(somarDias(dia, 1), '00:00'),
              status: 'chegou',
            },
          },
        }),
      ),
  });
  const profs = useQuery({
    queryKey: ['profissionais'],
    enabled: perfil === 'clinica',
    queryFn: () => chamar(api.GET('/profissionais')),
  });

  if (!usuario) return null;
  const itens = menuDoPerfil(usuario.perfil);
  const aguardando = perfil === 'secretaria' ? (espera.data?.length ?? 0) : 0;
  const meu = profs.data?.find((p) => p.usuario_id === usuario.id);
  const naEspera =
    perfil === 'clinica' && meu
      ? espera.data?.find((c) => c.profissional.id === meu.id)
      : undefined;
  const encerrar = async () => {
    await sair();
    navegar('/login', { replace: true });
  };

  return (
    <div className="app">
      <aside className="side">
        <div className="brand">
          <div className="logo">
            <IconeDente tamanho={20} />
          </div>
          QuickOdonto
        </div>
        <div className="role">
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: COR_PAINEL[usuario.perfil],
              flexShrink: 0,
              boxShadow: '0 0 0 3px rgba(255,255,255,.10)',
            }}
          />
          <div className="rolel">
            <small>Painel</small>
            <b>{NOME_PAINEL[usuario.perfil]}</b>
          </div>
          <IconeSeletor tamanho={16} />
        </div>
        <div className="navlabel">Menu</div>
        <nav aria-label="Principal" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {itens.map((item) => {
            const Icone = ICONES[item.icone];
            return (
              <NavLink
                key={item.rota}
                to={item.rota}
                end={item.rota === '/agenda'}
                className={({ isActive }) => `nav ${isActive ? 'on' : ''}`}
              >
                <Icone tamanho={20} />
                <span>{item.rotulo}</span>
                {item.rota === '/agenda/quadro' && aguardando > 0 && (
                  <span className="pill" aria-label={`${aguardando} aguardando`}>
                    {aguardando}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>
        {naEspera && (
          <Link to={`/clinica/prontuario/${naEspera.paciente.id}`} className="espera">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="espera-rotulo">Na sala de espera</span>
              <span className="pulse espera-pulso" />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>
                {naEspera.paciente.nome}
              </span>
              <span style={{ fontSize: 13, color: '#BFD9D2' }}>
                {naEspera.procedimento_previsto ?? 'Consulta'}
                {naEspera.status_desde && ` · aguarda há ${fmtDecorrido(naEspera.status_desde)}`}
              </span>
            </div>
          </Link>
        )}
        <div className="me" style={naEspera ? { marginTop: 0 } : undefined}>
          <Avatar nome={usuario.nome} tom="" />
          <div className="who">
            <b>{usuario.nome}</b>
            <small>{NOME_PERFIL[usuario.perfil]}</small>
          </div>
          <button
            type="button"
            className="ibtn g"
            style={{ color: '#A9C9C2' }}
            aria-label="Sair"
            onClick={encerrar}
          >
            <IconeSair />
          </button>
        </div>
      </aside>

      <div className="main">
        <Outlet />
      </div>

      <nav className="nav-movel" aria-label="Principal (celular)">
        {itens.map((item) => {
          const Icone = ICONES[item.icone];
          return (
            <NavLink key={item.rota} to={item.rota} end={item.rota === '/agenda'}>
              <span className="ic">
                <Icone tamanho={22} />
              </span>
              {item.rotulo}
            </NavLink>
          );
        })}
        <button type="button" onClick={encerrar}>
          <span className="ic">
            <IconeSair tamanho={22} />
          </span>
          Sair
        </button>
      </nav>
    </div>
  );
}
