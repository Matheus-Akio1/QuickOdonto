import type { Perfil } from '../api/types';

/**
 * Conveniência visual: o que cada perfil vê no menu e quais ações exibe.
 * Quem autoriza de verdade é sempre o servidor (403) — isto só evita mostrar o que não funciona.
 * Os menus seguem as pranchas do protótipo; itens de marcos futuros (OS, estoque, financeiro,
 * relatórios) entram quando as telas existirem.
 */
export interface ItemMenu {
  rota: string;
  rotulo: string;
  icone:
    | 'pacientes'
    | 'agenda'
    | 'quadro'
    | 'prontuario'
    | 'anamnese'
    | 'procedimentos'
    | 'usuarios'
    | 'laboratorio';
}

const MENUS: Record<Perfil, ItemMenu[]> = {
  secretaria: [
    { rota: '/pacientes', rotulo: 'Pacientes', icone: 'pacientes' },
    { rota: '/agenda', rotulo: 'Agenda', icone: 'agenda' },
    { rota: '/agenda/quadro', rotulo: 'Quadro do dia', icone: 'quadro' },
  ],
  clinica: [
    { rota: '/clinica/prontuario', rotulo: 'Prontuário', icone: 'prontuario' },
    { rota: '/clinica/anamnese', rotulo: 'Anamnese', icone: 'anamnese' },
    { rota: '/clinica/procedimentos', rotulo: 'Procedimentos', icone: 'procedimentos' },
  ],
  adm_clinica: [{ rota: '/admin/clinica', rotulo: 'Usuários', icone: 'usuarios' }],
  laboratorio: [{ rota: '/lab', rotulo: 'Laboratório', icone: 'laboratorio' }],
  adm_laboratorio: [{ rota: '/admin/lab', rotulo: 'Usuários', icone: 'usuarios' }],
};

export const menuDoPerfil = (perfil: Perfil): ItemMenu[] => MENUS[perfil];
export const paginaInicial = (perfil: Perfil): string => MENUS[perfil][0].rota;

/** Nome do painel (caixa "Painel" do menu e trilha das páginas). */
export const NOME_PAINEL: Record<Perfil, string> = {
  secretaria: 'Secretaria',
  clinica: 'Clínica',
  adm_clinica: 'Adm. Clínica',
  laboratorio: 'Laboratório',
  adm_laboratorio: 'Adm. Laboratório',
};

/** Cor do ponto do painel, conforme os acentos do sistema visual. */
export const COR_PAINEL: Record<Perfil, string> = {
  secretaria: '#5CC7B6',
  clinica: '#6E9FEA',
  adm_clinica: '#F2B880',
  laboratorio: '#9D8FF0',
  adm_laboratorio: '#E88BA9',
};

/** Como o perfil aparece em listas de usuários e no rodapé do menu. */
export const NOME_PERFIL: Record<Perfil, string> = {
  secretaria: 'Secretaria',
  clinica: 'Clínica (dentista)',
  adm_clinica: 'Administrador da clínica',
  laboratorio: 'Laboratório (técnico)',
  adm_laboratorio: 'Administrador do laboratório',
};

export const podeCadastrarPaciente = (p: Perfil) => p === 'secretaria';
/** O prontuário (conteúdo clínico) é só do dentista; a API devolve 403 aos demais. */
export const podeVerProntuario = (p: Perfil) => p === 'clinica';
export const podeAgendar = (p: Perfil) => p === 'secretaria';
