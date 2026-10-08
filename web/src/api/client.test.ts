import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Roteiro = (req: Request) => Response | Promise<Response>;

const json = (status: number, corpo?: unknown) =>
  new Response(corpo === undefined ? null : JSON.stringify(corpo), {
    status,
    headers: corpo === undefined ? {} : { 'content-type': 'application/json' },
  });

/** Carrega o cliente com um fetch falso (openapi-fetch captura o fetch global ao ser criado). */
async function carregar(roteiro: Roteiro) {
  const chamadas: { metodo: string; caminho: string; csrf: string | null }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (entrada: Request | string, init?: RequestInit) => {
      const req = entrada instanceof Request ? entrada : new Request(entrada, init);
      chamadas.push({
        metodo: req.method,
        caminho: new URL(req.url).pathname.replace('/api/v1', ''),
        csrf: req.headers.get('x-csrf-token'),
      });
      return roteiro(req);
    }),
  );
  vi.resetModules();
  const mod = await import('./client');
  return { ...mod, chamadas };
}

const caminho = (r: Request) => new URL(r.url).pathname.replace('/api/v1', '');

describe('cliente HTTP', () => {
  beforeEach(() => vi.useRealTimers());
  afterEach(() => vi.unstubAllGlobals());

  it('envia o CSRF só nas escritas e nunca em leituras', async () => {
    const { api, chamar, definirCsrf, chamadas } = await carregar(() => json(200, { itens: [] }));
    definirCsrf('token-csrf');
    await chamar(api.GET('/pacientes'));
    await chamar(api.POST('/pacientes', { body: { nome: 'Fulano de Tal' } }));
    expect(chamadas[0].csrf).toBeNull();
    expect(chamadas[1].csrf).toBe('token-csrf');
  });

  it('401 → renova a sessão uma vez e repete a requisição com o novo CSRF', async () => {
    let tentativas = 0;
    const { api, chamar, definirCsrf, chamadas } = await carregar((req) => {
      if (caminho(req) === '/auth/refresh') return json(200, { csrfToken: 'novo-csrf' });
      tentativas += 1;
      return tentativas === 1
        ? json(401, { erro: 'Sessão inválida ou expirada.' })
        : json(200, { itens: [] });
    });
    definirCsrf('velho-csrf');
    await chamar(api.POST('/pacientes', { body: { nome: 'Fulano de Tal' } }));
    expect(chamadas.map((c) => `${c.metodo} ${c.caminho}`)).toEqual([
      'POST /pacientes',
      'POST /auth/refresh',
      'POST /pacientes',
    ]);
    expect(chamadas[2].csrf).toBe('novo-csrf');
  });

  it('várias requisições com 401 ao mesmo tempo disparam uma única renovação (single-flight)', async () => {
    const vistas = new Set<string>();
    const { api, chamar, chamadas } = await carregar(async (req) => {
      if (caminho(req) === '/auth/refresh') {
        await new Promise((r) => setTimeout(r, 20));
        return json(200, { csrfToken: 'x' });
      }
      const chave = req.url;
      if (!vistas.has(chave)) {
        vistas.add(chave);
        return json(401, { erro: 'Sessão inválida ou expirada.' });
      }
      return json(200, { itens: [], pagina: 1, limite: 1, total: 0 });
    });
    await Promise.all([
      chamar(api.GET('/pacientes', { params: { query: { pagina: 1 } as never } })),
      chamar(api.GET('/pacientes', { params: { query: { pagina: 2 } as never } })),
      chamar(api.GET('/pacientes', { params: { query: { pagina: 3 } as never } })),
    ]);
    expect(chamadas.filter((c) => c.caminho === '/auth/refresh')).toHaveLength(1);
  });

  it('renovação recusada → avisa que a sessão expirou e propaga o 401', async () => {
    const { api, chamar, aoSessaoExpirar } = await carregar((req) =>
      caminho(req) === '/auth/refresh'
        ? json(401, { erro: 'x' })
        : json(401, { erro: 'Sessão inválida ou expirada.' }),
    );
    const expirou = vi.fn();
    aoSessaoExpirar(expirou);
    await expect(chamar(api.GET('/pacientes'))).rejects.toMatchObject({ status: 401 });
    expect(expirou).toHaveBeenCalledTimes(1);
  });

  it('401 do login não tenta renovar (senha errada não é sessão expirada)', async () => {
    const { api, chamar, chamadas, aoSessaoExpirar } = await carregar(() =>
      json(401, { erro: 'E-mail ou senha inválidos.' }),
    );
    const expirou = vi.fn();
    aoSessaoExpirar(expirou);
    await expect(
      chamar(api.POST('/auth/login', { body: { email: 'a@b.test', senha: 'x' } })),
    ).rejects.toThrow('E-mail ou senha inválidos.');
    expect(chamadas).toHaveLength(1);
    expect(expirou).not.toHaveBeenCalled();
  });

  it('traduz erro da API em mensagem e falha de rede em status 0', async () => {
    const a = await carregar(() => json(409, { erro: 'Já existe um paciente com este CPF.' }));
    await expect(a.chamar(a.api.GET('/pacientes'))).rejects.toMatchObject({
      status: 409,
      message: 'Já existe um paciente com este CPF.',
    });

    const b = await carregar(() => {
      throw new TypeError('Failed to fetch');
    });
    await expect(b.chamar(b.api.GET('/pacientes'))).rejects.toMatchObject({ status: 0 });
  });
});
