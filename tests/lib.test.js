const { cifrar, decifrar, hashBusca } = require('../src/lib/crypto');
const { cpfValido } = require('../src/lib/validacoes');
const { mascararCpf, mascararCelular } = require('../src/lib/mascara');
const { parteLocal, instanteLocal } = require('../src/lib/tempo');

describe('criptografia de campo (AES-256-GCM)', () => {
  test('ida e volta; mesmo texto gera cifrados diferentes (IV aleatório); valor não aparece em claro', () => {
    const a = cifrar('52998224725');
    const b = cifrar('52998224725');
    expect(decifrar(a)).toBe('52998224725');
    expect(a).not.toBe(b);
    expect(a).not.toContain('52998224725');
    expect(a.startsWith('v1:')).toBe(true);
  });

  test('adulteração do cifrado é detectada (GCM) e formato inválido é recusado', () => {
    const c = cifrar('segredo');
    const partes = c.split(':');
    partes[3] = Buffer.from('adulterado').toString('base64url');
    expect(() => decifrar(partes.join(':'))).toThrow();
    expect(() => decifrar('lixo')).toThrow(/inválido/);
  });

  test('null passa direto; hash de busca é determinístico e depende da chave', () => {
    expect(cifrar(null)).toBeNull();
    expect(decifrar(null)).toBeNull();
    expect(hashBusca('123')).toBe(hashBusca('123'));
    expect(hashBusca('123')).not.toBe(hashBusca('124'));
    expect(hashBusca('123')).toMatch(/^[0-9a-f]{64}$/);
    const antiga = process.env.HMAC_KEY;
    const comChaveA = hashBusca('123');
    process.env.HMAC_KEY = Buffer.alloc(32, 1).toString('base64');
    const comChaveB = hashBusca('123');
    process.env.HMAC_KEY = antiga;
    expect(comChaveA).not.toBe(comChaveB);
  });

  test('chave ausente ou do tamanho errado falha ruidosamente', () => {
    const antiga = process.env.ENC_KEY;
    process.env.ENC_KEY = 'curta';
    expect(() => cifrar('x')).toThrow(/ENC_KEY/);
    process.env.ENC_KEY = antiga;
  });
});

describe('CPF e máscaras', () => {
  test('RN-001: dígitos verificadores, formatação e sequências repetidas', () => {
    expect(cpfValido('529.982.247-25')).toBe(true);
    expect(cpfValido('52998224725')).toBe(true);
    expect(cpfValido('52998224726')).toBe(false);
    expect(cpfValido('11111111111')).toBe(false);
    expect(cpfValido('123')).toBe(false);
    expect(cpfValido(null)).toBe(false);
  });

  test('máscara mostra só o necessário', () => {
    expect(mascararCpf('52998224725')).toBe('***.***.***-25');
    expect(mascararCelular('11987654321')).toBe('(11) *****-4321');
    expect(mascararCelular('123')).toBeNull();
  });
});

describe('tempo (Brasília)', () => {
  test('ida e volta entre instante e parte local', () => {
    const i = instanteLocal('2027-03-10', 8 * 60 + 30);
    expect(i.toISOString()).toBe('2027-03-10T11:30:00.000Z');
    expect(parteLocal(i)).toEqual({ data: '2027-03-10', dow: 3, minutos: 510 });
  });
});
