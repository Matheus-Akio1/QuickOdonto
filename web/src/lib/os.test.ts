import type { OrdemServico } from '../api/types';
import { mascaraCnpj, mascaraDocumento } from './mascaras';
import {
  casaBusca,
  lerElementos,
  nomeDeEtapa,
  seloClinica,
  seloProducao,
  tituloTrabalho,
} from './os';

const base: OrdemServico = {
  id: '1',
  numero: 'OS-0007',
  origem: 'propria',
  status: 'aberta',
  etapa: 'laboratorio',
  etapa_producao: 'estrutura',
  tipo_trabalho: 'Coroa de zircônia',
  elementos: [11],
  cliente: { id: 'c', nome: 'QuickOdonto Clínica', tipo: 'interno' },
  paciente: { id: 'p', nome: 'Luiza Ferreira' },
  prazo: { situacao: 'no_prazo', dias: 9 },
  previsao_entrega: '2026-10-20',
  refacoes: 0,
  provas: 0,
  prova_aberta: false,
  criado_em: '2026-10-10T12:00:00.000Z',
};
const os = (extra: Partial<OrdemServico>): OrdemServico => ({ ...base, ...extra });

describe('ordens de serviço — textos do protótipo', () => {
  it('monta o título com os elementos', () => {
    expect(tituloTrabalho(os({ elementos: [] }))).toBe('Coroa de zircônia');
    expect(tituloTrabalho(base)).toBe('Coroa de zircônia · 11');
    expect(tituloTrabalho(os({ tipo_trabalho: 'Facetas', elementos: [12, 22] }))).toBe(
      'Facetas · 12 e 22',
    );
    expect(tituloTrabalho(os({ tipo_trabalho: 'Ponte fixa', elementos: [24, 25, 26] }))).toBe(
      'Ponte fixa · 3 elementos',
    );
  });

  it('selo da clínica: atraso vence qualquer outra informação', () => {
    expect(seloClinica(base)).toEqual({ texto: 'Entrega 20/10', classe: 'b-mut' });
    expect(seloClinica(os({ prazo: { situacao: 'atrasada', dias: 4 } }))).toMatchObject({
      texto: 'Atrasada 4 dias',
      classe: 'b-bad',
    });
    expect(seloClinica(os({ prazo: { situacao: 'atrasada', dias: 1 } })).texto).toBe(
      'Atrasada 1 dia',
    );
    expect(seloClinica(os({ prazo: { situacao: 'a_vencer', dias: 2 } })).texto).toBe(
      'Vence em 2 dias',
    );
    expect(seloClinica(os({ prazo: { situacao: 'a_vencer', dias: 0 } })).texto).toBe('Vence hoje');
    expect(seloClinica(os({ etapa: 'retorno', prova_aberta: true })).texto).toBe(
      'Prova na clínica',
    );
    expect(
      seloClinica(
        os({ etapa: 'pre_laboratorio', previsao_entrega: null, prazo: { situacao: 'sem_prazo' } }),
      ).texto,
    ).toBe('Sem prazo');
  });

  it('selo da produção: prova na clínica, refação e pronta', () => {
    expect(seloProducao(os({ prova_aberta: true }))).toEqual({
      texto: 'Na clínica',
      classe: 'b-info',
    });
    expect(seloProducao(os({ refacoes: 1 }))).toEqual({
      texto: 'Refação 1 · 20/10',
      classe: 'b-warn',
    });
    expect(seloProducao(os({ etapa_producao: 'pronta' })).texto).toBe('Pronta para envio');
    expect(
      seloProducao(os({ status: 'concluida', concluida_em: '2026-10-11T02:30:00.000Z' })).texto,
    ).toBe('Entregue 10/10'); // 23h30 de 10/10 em Brasília
  });

  it('busca local por número, trabalho, paciente ou cliente', () => {
    expect(casaBusca(base, '')).toBe(true);
    expect(casaBusca(base, 'os-0007')).toBe(true);
    expect(casaBusca(base, 'luiza')).toBe(true);
    expect(casaBusca(base, 'zirc')).toBe(true);
    expect(casaBusca(base, 'marcos')).toBe(false);
  });

  it('nomeia etapas dos dois lados', () => {
    expect(nomeDeEtapa('pre_laboratorio')).toBe('Pré-laboratório');
    expect(nomeDeEtapa('acabamento')).toBe('Acabamento');
    expect(nomeDeEtapa('cancelada')).toBe('Cancelada');
    expect(nomeDeEtapa(null)).toBe('—');
  });
});

describe('formulário de OS', () => {
  it('lê elementos em notação FDI e recusa o que estiver fora', () => {
    expect(lerElementos('')).toEqual([]);
    expect(lerElementos('46')).toEqual([46]);
    expect(lerElementos('12 e 22')).toEqual([12, 22]);
    expect(lerElementos('24, 25; 26 26')).toEqual([24, 25, 26]);
    expect(lerElementos('19')).toBeNull();
    expect(lerElementos('abc')).toBeNull();
  });

  it('mascara CNPJ e escolhe CPF/CNPJ pela quantidade de dígitos', () => {
    expect(mascaraCnpj('11222333000181')).toBe('11.222.333/0001-81');
    expect(mascaraCnpj('112223')).toBe('11.222.3');
    expect(mascaraDocumento('52998224725')).toBe('529.982.247-25');
    expect(mascaraDocumento('112223330001')).toBe('11.222.333/0001');
  });
});
