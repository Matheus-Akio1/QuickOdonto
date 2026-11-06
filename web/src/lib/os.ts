import type { EtapaOs, EtapaProducao, OrdemServico } from '../api/types';
import { dataDe, fmtDataCurta } from './datas';

/** Colunas do quadro da clínica, com as cores da prancha "Secretaria · ordens de serviço". */
export const ETAPAS_OS: { id: EtapaOs; titulo: string; ponto: string }[] = [
  { id: 'pre_laboratorio', titulo: 'Pré-laboratório', ponto: '#7A8683' },
  { id: 'envio', titulo: 'Envio', ponto: '#2F6FD0' },
  { id: 'laboratorio', titulo: 'Laboratório', ponto: '#6553D6' },
  { id: 'retorno', titulo: 'Retorno / Agenda', ponto: '#DE6B2F' },
  { id: 'concluida', titulo: 'Concluída', ponto: '#12A150' },
];
/**
 * Colunas do quadro: a OS é gerada pelo dentista já enviada ao laboratório, então o
 * "Pré-laboratório" não aparece (o nome continua existindo para OS antigas e para o histórico).
 */
export const COLUNAS_QUADRO = ETAPAS_OS.filter((e) => e.id !== 'pre_laboratorio');
export const NOME_ETAPA = Object.fromEntries(ETAPAS_OS.map((e) => [e.id, e.titulo])) as Record<
  EtapaOs,
  string
>;
export const ETAPA_CURTA: Record<EtapaOs, string> = {
  pre_laboratorio: 'Pré-lab.',
  envio: 'Envio',
  laboratorio: 'Laboratório',
  retorno: 'Retorno',
  concluida: 'Concluída',
};

/** Etapas de produção, com os pontos coloridos da prancha "Laboratório · ordens de serviço". */
export const ETAPAS_PRODUCAO: { id: EtapaProducao; titulo: string; ponto: string }[] = [
  { id: 'recebida', titulo: 'Recebida', ponto: '#8A9490' },
  { id: 'modelo', titulo: 'Modelo', ponto: '#2F6FD0' },
  { id: 'estrutura', titulo: 'Estrutura', ponto: '#6553D6' },
  { id: 'prova', titulo: 'Prova', ponto: '#DE6B2F' },
  { id: 'acabamento', titulo: 'Acabamento', ponto: '#0F6B63' },
  { id: 'pronta', titulo: 'Pronta', ponto: '#12A150' },
  { id: 'enviada', titulo: 'Enviada', ponto: '#5E6B68' },
];
export const PRODUCAO = Object.fromEntries(ETAPAS_PRODUCAO.map((e) => [e.id, e])) as Record<
  EtapaProducao,
  (typeof ETAPAS_PRODUCAO)[number]
>;

/** Nome de qualquer etapa (dos dois lados) ou status, para o histórico. */
export function nomeDeEtapa(v: string | null | undefined): string {
  if (!v) return '—';
  if (v in NOME_ETAPA) return NOME_ETAPA[v as EtapaOs];
  if (v in PRODUCAO) return PRODUCAO[v as EtapaProducao].titulo;
  return { aberta: 'Aberta', cancelada: 'Cancelada', concluida: 'Entregue' }[v] ?? v;
}

/** "Coroa metalocerâmica · 46", "Facetas · 12 e 22", "Ponte fixa · 3 elementos". */
export function tituloTrabalho(os: Pick<OrdemServico, 'tipo_trabalho' | 'elementos'>): string {
  const e = os.elementos;
  if (!e.length) return os.tipo_trabalho;
  if (e.length === 1) return `${os.tipo_trabalho} · ${e[0]}`;
  if (e.length === 2) return `${os.tipo_trabalho} · ${e[0]} e ${e[1]}`;
  return `${os.tipo_trabalho} · ${e.length} elementos`;
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

export interface Selo {
  texto: string;
  classe: 'b-mut' | 'b-bad' | 'b-warn' | 'b-ok' | 'b-cor' | 'b-info';
  alerta?: boolean;
}

/** Selo de prazo do cartão no quadro da clínica. */
export function seloClinica(os: OrdemServico): Selo {
  if (os.status === 'cancelada') return { texto: 'Cancelada', classe: 'b-mut' };
  if (os.status === 'concluida') {
    return {
      texto: os.concluida_em ? fmtDataCurta(dataDe(os.concluida_em)) : 'Concluída',
      classe: 'b-ok',
    };
  }
  if (os.prazo.situacao === 'atrasada') {
    return {
      texto: `Atrasada ${plural(os.prazo.dias ?? 0, 'dia', 'dias')}`,
      classe: 'b-bad',
      alerta: true,
    };
  }
  if (os.etapa === 'retorno' && os.prova_aberta)
    return { texto: 'Prova na clínica', classe: 'b-cor' };
  if (os.prazo.situacao === 'a_vencer') {
    return {
      texto:
        os.prazo.dias === 0
          ? 'Vence hoje'
          : `Vence em ${plural(os.prazo.dias ?? 0, 'dia', 'dias')}`,
      classe: 'b-warn',
    };
  }
  if (os.previsao_entrega) {
    return { texto: `Entrega ${fmtDataCurta(os.previsao_entrega)}`, classe: 'b-mut' };
  }
  return os.etapa === 'pre_laboratorio'
    ? { texto: 'Sem prazo', classe: 'b-mut' }
    : { texto: `Criada ${fmtDataCurta(dataDe(os.criado_em))}`, classe: 'b-mut' };
}

/** Selo da coluna "Prazo" na lista do laboratório. */
export function seloProducao(os: OrdemServico): Selo {
  if (os.status === 'cancelada') return { texto: 'Cancelada', classe: 'b-mut' };
  if (os.status === 'concluida') {
    return {
      texto: `Entregue ${os.concluida_em ? fmtDataCurta(dataDe(os.concluida_em)) : ''}`.trim(),
      classe: 'b-ok',
    };
  }
  if (os.prazo.situacao === 'atrasada') {
    return { texto: `Atrasada ${plural(os.prazo.dias ?? 0, 'dia', 'dias')}`, classe: 'b-bad' };
  }
  if (os.prova_aberta) return { texto: 'Na clínica', classe: 'b-info' };
  const data = os.previsao_entrega ? fmtDataCurta(os.previsao_entrega) : '';
  if (os.etapa_producao === 'pronta') return { texto: 'Pronta para envio', classe: 'b-ok' };
  if (os.etapa_producao === 'enviada') {
    return {
      texto: `Enviada ${fmtDataCurta(dataDe(os.enviado_em ?? os.criado_em))}`,
      classe: 'b-mut',
    };
  }
  if (os.refacoes > 0) {
    return { texto: `Refação ${os.refacoes} · ${data}`, classe: 'b-warn' };
  }
  return {
    texto: `Entrega ${data}`,
    classe: os.prazo.situacao === 'a_vencer' ? 'b-warn' : 'b-mut',
  };
}

/** Busca local (número, trabalho, paciente, cliente): nada sensível vai para a URL. */
export function casaBusca(os: OrdemServico, termo: string): boolean {
  const t = termo.trim().toLowerCase();
  if (!t) return true;
  return [os.numero, os.tipo_trabalho, os.paciente.nome, os.cliente.nome].some((v) =>
    v.toLowerCase().includes(t),
  );
}

export const NOME_LABORATORIO = { proprio: 'Lab. QuickOdonto' } as const;

export const TIPOS_SUGERIDOS = [
  'Coroa metalocerâmica',
  'Coroa de zircônia',
  'Faceta',
  'Ponte fixa',
  'Prótese total superior',
  'Prótese total inferior',
  'PPR superior',
  'PPR inferior',
  'Protocolo inferior',
  'Placa miorrelaxante',
];

const FDI = /^(1[1-8]|2[1-8]|3[1-8]|4[1-8]|5[1-5]|6[1-5]|7[1-5]|8[1-5])$/;

/** "46", "12 e 22", "24, 25 26" → [46] / [12, 22] / [24, 25, 26]; null se houver algo fora da FDI. */
export function lerElementos(texto: string): number[] | null {
  const partes = texto
    .split(/[\s,;e]+/i)
    .map((p) => p.trim())
    .filter(Boolean);
  if (partes.some((p) => !FDI.test(p))) return null;
  return [...new Set(partes.map(Number))];
}

/** No celular, o que precisa de atenção vem primeiro: atrasadas, depois as que vencem. */
export function ordemPrazo(o: OrdemServico): number {
  if (o.prazo.situacao === 'atrasada') return -1000 - (o.prazo.dias ?? 0);
  if (o.prazo.situacao === 'sem_prazo') return 1000;
  return o.prazo.dias ?? 500;
}
