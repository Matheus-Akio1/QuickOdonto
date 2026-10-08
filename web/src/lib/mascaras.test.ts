import { cpfValido, mascaraCelular, mascaraCep, mascaraCpf, soDigitos } from './mascaras';

describe('máscaras', () => {
  it('formata CPF progressivamente', () => {
    expect(mascaraCpf('529')).toBe('529');
    expect(mascaraCpf('5299')).toBe('529.9');
    expect(mascaraCpf('52998224725')).toBe('529.982.247-25');
    expect(mascaraCpf('529.982.247-25999')).toBe('529.982.247-25');
  });

  it('formata celular com 10 ou 11 dígitos', () => {
    expect(mascaraCelular('')).toBe('');
    expect(mascaraCelular('11')).toBe('(11');
    expect(mascaraCelular('1198765')).toBe('(11) 9876-5');
    expect(mascaraCelular('11987654321')).toBe('(11) 98765-4321');
    expect(mascaraCelular('1133334444')).toBe('(11) 3333-4444');
  });

  it('formata CEP e extrai dígitos', () => {
    expect(mascaraCep('01001000')).toBe('01001-000');
    expect(soDigitos('(11) 9.8765-4321')).toBe('11987654321');
  });
});

describe('RN-001 no front', () => {
  it('valida dígitos verificadores e recusa sequências', () => {
    expect(cpfValido('529.982.247-25')).toBe(true);
    expect(cpfValido('52998224726')).toBe(false);
    expect(cpfValido('11111111111')).toBe(false);
    expect(cpfValido('123')).toBe(false);
  });
});
