import type { components } from './schema';

type S = components['schemas'];
export type Perfil = S['UsuarioSessao']['perfil'];
export type Me = S['Me'];
export type Usuario = S['Usuario'];
export type AuditoriaItem = S['AuditoriaItem'];
export type Notificacao = S['Notificacao'];
export type Paciente = S['Paciente'];
export type PacienteFicha = S['PacienteFicha'];
export type PacienteEntrada = S['PacienteEntrada'];
export type PacienteResumo = S['PacienteResumo'];
export type Profissional = S['Profissional'];
export type Horario = S['Horario'];
export type Consulta = S['Consulta'];
export type StatusConsulta = S['Consulta']['status'];
export type Bloqueio = S['Bloqueio'];
