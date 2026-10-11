// Ícones do protótipo ("QuickOdonto — telas melhoradas"): mesmos traços, 24×24, stroke 1.8.
import type { ReactNode } from 'react';

interface Props {
  tamanho?: number;
  className?: string;
}

function Base({ tamanho = 18, className, children }: Props & { children: ReactNode }) {
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      style={{ flexShrink: 0 }}
    >
      {children}
    </svg>
  );
}

export const IconeEditar = (p: Props) => (
  <Base {...p}>
    <path d="M4 20h4L19 9l-4-4L4 16z" />
  </Base>
);
export const IconeDente = (p: Props) => (
  <Base {...p}>
    <path d="M7 3c-2.5 0-4 2-4 4.5 0 2 1 3.5 1.5 5.5.6 2.6.8 8 3 8 1.8 0 1.7-5 4.5-5s2.7 5 4.5 5c2.2 0 2.4-5.4 3-8 .5-2 1.5-3.5 1.5-5.5C21 5 19.5 3 17 3c-2 0-3 1-5 1S9 3 7 3z" />
  </Base>
);
export const IconeSetaDireita = (p: Props) => (
  <Base {...p}>
    <path d="M9 6l6 6-6 6" />
  </Base>
);
export const IconeMais = (p: Props) => (
  <Base {...p}>
    <path d="M12 5v14M5 12h14" />
  </Base>
);
export const IconeRelogio = (p: Props) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Base>
);
export const IconeWhatsapp = (p: Props) => (
  <Base {...p}>
    <path d="M20 12a8 8 0 0 1-11.8 7L4 20l1.1-4A8 8 0 1 1 20 12z" />
  </Base>
);
export const IconeAbrirFicha = (p: Props) => (
  <Base {...p}>
    <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
  </Base>
);
export const IconeCheck = (p: Props) => (
  <Base {...p}>
    <path d="M5 12l5 5 9-10" />
  </Base>
);
export const IconeSeletor = (p: Props) => (
  <Base {...p}>
    <path d="M8 9l4-4 4 4M16 15l-4 4-4-4" />
  </Base>
);
export const IconeSair = (p: Props) => (
  <Base {...p}>
    <path d="M9 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4M16 8l4 4-4 4M20 12H9" />
  </Base>
);
export const IconeBusca = (p: Props) => (
  <Base {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-3.5-3.5" />
  </Base>
);
export const IconeSino = (p: Props) => (
  <Base {...p}>
    <path d="M18 16v-5a6 6 0 1 0-12 0v5l-2 2h16zM10 21h4" />
  </Base>
);
export const IconePacientes = (p: Props) => (
  <Base {...p}>
    <path d="M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1" />
    <circle cx="9.5" cy="7.5" r="3.5" />
    <path d="M21 19v-1a4 4 0 0 0-3-3.87M15.5 4.13a4 4 0 0 1 0 7.75" />
  </Base>
);
export const IconeAgenda = (p: Props) => (
  <Base {...p}>
    <rect x="3" y="4.5" width="18" height="16" rx="2" />
    <path d="M16 3v3M8 3v3M3 9.5h18" />
  </Base>
);
export const IconePrancheta = (p: Props) => (
  <Base {...p}>
    <rect x="5" y="4" width="14" height="17" rx="2" />
    <path d="M9 4V3h6v1M9 10h6M9 14h6M9 18h3" />
  </Base>
);
export const IconeCadeado = (p: Props) => (
  <Base {...p}>
    <path d="M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3" />
  </Base>
);
export const IconeCoracao = (p: Props) => (
  <Base {...p}>
    <path d="M12 20s-7-4.35-7-10a4 4 0 0 1 7-2.65A4 4 0 0 1 19 10c0 5.65-7 10-7 10z" />
  </Base>
);
export const IconeSetaBaixo = (p: Props) => (
  <Base {...p}>
    <path d="M6 9l6 6 6-6" />
  </Base>
);
export const IconeEscudo = (p: Props) => (
  <Base {...p}>
    <path d="M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6z" />
  </Base>
);
export const IconeSetaEsquerda = (p: Props) => (
  <Base {...p}>
    <path d="M15 6l-6 6 6 6" />
  </Base>
);
export const IconeCheckCirculo = (p: Props) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M8 12.5l3 3 5-6" />
  </Base>
);
export const IconeFechar = (p: Props) => (
  <Base {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Base>
);
export const IconeRaio = (p: Props) => (
  <Base {...p}>
    <path d="M13 3L5 14h6l-1 7 8-11h-6z" />
  </Base>
);
export const IconeFinanceiro = (p: Props) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M15 9.5c0-1.4-1.3-2.5-3-2.5s-3 1-3 2.3c0 3 6 1.7 6 4.7 0 1.3-1.3 2.5-3 2.5s-3-1.1-3-2.5M12 5.5v1.5M12 17v1.5" />
  </Base>
);
export const IconePessoa = (p: Props) => (
  <Base {...p}>
    <path d="M19 20v-1a5 5 0 0 0-5-5h-4a5 5 0 0 0-5 5v1" />
    <circle cx="12" cy="7.5" r="3.5" />
  </Base>
);
export const IconePasta = (p: Props) => (
  <Base {...p}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </Base>
);
export const IconeGrafico = (p: Props) => (
  <Base {...p}>
    <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
  </Base>
);
export const IconeReagendar = (p: Props) => (
  <Base {...p}>
    <path d="M4 4v5h5M20 20v-5h-5M5.6 15A8 8 0 0 0 20 12M18.4 9A8 8 0 0 0 4 12" />
  </Base>
);
export const IconeAlerta = (p: Props) => (
  <Base {...p}>
    <path d="M12 3l10 18H2z" />
    <path d="M12 10v5M12 18v.5" />
  </Base>
);
export const IconeOlho = (p: Props) => (
  <Base {...p}>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
  </Base>
);
export const IconeQuadro = (p: Props) => (
  <Base {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M9 4v16M15 4v16" />
  </Base>
);
export const IconeTrocar = (p: Props) => (
  <Base {...p}>
    <path d="M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7" />
  </Base>
);
export const IconeFiltros = (p: Props) => (
  <Base {...p}>
    <path d="M3 5h18M6 12h12M10 19h4" />
  </Base>
);
export const IconeBaixar = (p: Props) => (
  <Base {...p}>
    <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
  </Base>
);
export const IconeCaixa = (p: Props) => (
  <Base {...p}>
    <path d="M3 7l9-4 9 4v10l-9 4-9-4z" />
    <path d="M3 7l9 4 9-4M12 11v10" />
  </Base>
);
export const IconeImprimir = (p: Props) => (
  <Base {...p}>
    <path d="M7 9V4h10v5M7 17H5a1 1 0 0 1-1-1v-5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v5a1 1 0 0 1-1 1h-2" />
    <path d="M7 14h10v6H7z" />
  </Base>
);
export const IconeFrasco = (p: Props) => (
  <Base {...p}>
    <path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3" />
  </Base>
);
export const IconeDocumento = (p: Props) => (
  <Base {...p}>
    <path d="M6 3h8l4 4v14H6z" />
    <path d="M14 3v4h4M9 13h6M9 17h4" />
  </Base>
);
export const IconeHistorico = (p: Props) => (
  <Base {...p}>
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5" />
    <path d="M12 7v5l3 2" />
  </Base>
);
export const IconeClipe = (p: Props) => (
  <Base {...p}>
    <path d="M20 11l-8 8a5 5 0 0 1-7-7l8-8a3 3 0 0 1 4 4l-8 8a1 1 0 0 1-2-2l7-7" />
  </Base>
);
