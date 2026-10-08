import type { ReactNode } from 'react';

function Icone({ children }: { children: ReactNode }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const IconeAgenda = () => (
  <Icone>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M8 3v4M16 3v4M3 10h18" />
  </Icone>
);
export const IconeQuadro = () => (
  <Icone>
    <rect x="3" y="4" width="5" height="16" rx="1" />
    <rect x="10" y="4" width="5" height="10" rx="1" />
    <rect x="17" y="4" width="4" height="13" rx="1" />
  </Icone>
);
export const IconePacientes = () => (
  <Icone>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20c-.3-2.2-1.5-3.8-3.2-4.7" />
  </Icone>
);
export const IconeUsuarios = () => (
  <Icone>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c.7-4 3.9-6 8-6s7.3 2 8 6" />
  </Icone>
);
export const IconeDente = () => (
  <Icone>
    <path d="M7 3C4.5 3 3 4.8 3 7.2c0 2 .8 3.2 1.5 5 .7 1.8.6 4 1.3 6.3.3 1 1.1 1.5 1.8 1.5 1.2 0 1.6-1.5 2-3 .3-1 .8-1.4 1.4-1.4s1.1.4 1.4 1.4c.4 1.5.8 3 2 3 .7 0 1.5-.5 1.8-1.5.7-2.3.6-4.5 1.3-6.3.7-1.8 1.5-3 1.5-5C21 4.8 19.5 3 17 3c-1.8 0-2.8 1-5 1S8.8 3 7 3Z" />
  </Icone>
);
export const IconeSino = () => (
  <Icone>
    <path d="M6 9a6 6 0 1 1 12 0c0 6 2.500 7.500 2.500 7.500h-17S6 15 6 9ZM10 20a2 2 0 0 0 4 0" />
  </Icone>
);
export const IconeSair = () => (
  <Icone>
    <path d="M9 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4M16 8l4 4-4 4M20 12H9" />
  </Icone>
);
