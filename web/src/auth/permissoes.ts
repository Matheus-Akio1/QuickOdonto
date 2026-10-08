import type { Perfil } from '../api/types';

/**
 * Conveniência visual: o que cada perfil vê no menu e quais ações exibe.
 * Quem autoriza de verdade é sempre o servidor (403) — isto só evita mostrar o que não funciona.
 */
export interface ItemMenu {
  rota: string;
  rotulo: string;
  icone: 'agenda' | 'quadro' | 'pacientes' | 'usuarios' | 'dente';
}

const MENUS: Record<Perfil, ItemMenu[]> = {
  secretaria: [
    { rota: '/agenda', rotulo: 'Agenda', icone: 'agenda' },
    { rota: '/agenda/quadro', rotulo: 'Quadro do dia', icone: 'quadro' },
    { rota: '/pacientes', rotulo: 'Pacientes', icone: 'pacientes' },
  ],
  clinica: [
    { rota: '/agenda', rotulo: 'Agenda', icone: 'agenda' },
    { rota: '/agenda/quadro', rotulo: 'Quadro do dia', icone: 'quadro' },
    { rota: '/pacientes', rotulo: 'Pacientes', icone: 'pacientes' },
  ],
  adm_clinica: [{ rota: '/admin/clinica', rotulo: 'Equipe e auditoria', icone: 'usuarios' }],
  laboratorio: [{ rota: '/lab', rotulo: 'Laboratório', icone: 'dente' }],
  adm_laboratorio: [{ rota: '/admin/lab', rotulo: 'Equipe e permissões', icone: 'usuarios' }],
};

export const menuDoPerfil = (perfil: Perfil): ItemMenu[] => MENUS[perfil];
export const paginaInicial = (perfil: Perfil): string => MENUS[perfil][0].rota;

export const NOME_PERFIL: Record<Perfil, string> = {
  secretaria: 'Secretaria',
  clinica: 'Dentista',
  adm_clinica: 'Administração da clínica',
  laboratorio: 'Laboratório',
  adm_laboratorio: 'Administração do laboratório',
};

export const podeCadastrarPaciente = (p: Perfil) => p === 'secretaria';
export const podeAgendar = (p: Perfil) => p === 'secretaria';
