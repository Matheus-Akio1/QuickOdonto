import createClient, { type Middleware } from 'openapi-fetch';
import type { paths } from './schema';

/**
 * Cliente HTTP tipado pelo contrato OpenAPI. Segurança (seção 3.2):
 *  - sessão só por cookie httpOnly (credentials: 'include'); o front nunca lê nem guarda token de sessão;
 *  - o token CSRF fica apenas em memória e vai no header das escritas;
 *  - 401 → uma renovação transparente (single-flight) e repetição da requisição.
 */
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const BASE = import.meta.env.VITE_API_URL || '/api/v1';
const SEGURAS = new Set(['GET', 'HEAD', 'OPTIONS']);
const SEM_RENOVACAO = [
  '/auth/login',
  '/auth/refresh',
  '/auth/esqueci-senha',
  '/auth/redefinir-senha',
];

let csrfToken: string | null = null;
let aoExpirarSessao: () => void = () => {};
let renovando: Promise<boolean> | null = null;

export const definirCsrf = (token: string | null) => {
  csrfToken = token;
};
export const aoSessaoExpirar = (fn: () => void) => {
  aoExpirarSessao = fn;
};

async function renovarSessao(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/auth/refresh`, { method: 'POST', credentials: 'include' });
    if (!res.ok) return false;
    const corpo = (await res.json()) as { csrfToken?: string };
    if (corpo.csrfToken) csrfToken = corpo.csrfToken;
    return true;
  } catch {
    return false;
  }
}

const originais = new Map<string, Request>();

const middleware: Middleware = {
  onRequest({ request, id }) {
    if (!SEGURAS.has(request.method) && csrfToken) request.headers.set('X-CSRF-Token', csrfToken);
    originais.set(id, request.clone());
    return request;
  },
  async onResponse({ request, response, id }) {
    const original = originais.get(id);
    originais.delete(id);
    const caminho = new URL(request.url).pathname.replace(/^\/api\/v1/, '');
    if (response.status !== 401 || !original || SEM_RENOVACAO.includes(caminho)) return undefined;

    renovando ??= renovarSessao().finally(() => {
      renovando = null;
    });
    if (!(await renovando)) {
      aoExpirarSessao();
      return undefined;
    }
    if (!SEGURAS.has(original.method) && csrfToken) original.headers.set('X-CSRF-Token', csrfToken);
    return fetch(original);
  },
};

export const api = createClient<paths>({ baseUrl: BASE, credentials: 'include' });
api.use(middleware);

type Resultado<T> = { data?: T; error?: unknown; response: Response };

/** Converte o resultado do openapi-fetch em dado ou ApiError (mensagem da API em português). */
export async function chamar<T>(promessa: Promise<Resultado<T>>): Promise<T> {
  let r: Resultado<T>;
  try {
    r = await promessa;
  } catch {
    throw new ApiError(0, 'Sem conexão com o servidor. Verifique sua internet e tente de novo.');
  }
  if (r.response.ok) return r.data as T;
  const erro = (r.error as { erro?: string } | undefined)?.erro;
  throw new ApiError(r.response.status, erro ?? 'Não foi possível concluir a operação.');
}

export const mensagemDeErro = (e: unknown): string =>
  e instanceof Error ? e.message : 'Algo deu errado. Tente novamente.';
