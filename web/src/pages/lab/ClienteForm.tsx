import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, chamar, mensagemDeErro } from '../../api/client';
import type { LabCliente, LabClienteEntrada } from '../../api/types';
import { Button } from '../../components/Button';
import { Overlay } from '../../components/Overlay';
import { mascaraCelular, mascaraDocumento, soDigitos } from '../../lib/mascaras';
import { useToast } from '../../toast/useToast';

interface Props {
  cliente?: LabCliente;
  onFechar: () => void;
  aoSalvar?: (id: string) => void;
}

/**
 * Cadastro de cliente do laboratório. Na edição, documento e telefone chegam mascarados:
 * ficam em branco e só são enviados se o usuário digitar um novo valor.
 */
export function ClienteForm({ cliente, onFechar, aoSalvar }: Props) {
  const qc = useQueryClient();
  const { avisar } = useToast();
  const [erro, setErro] = useState<string | null>(null);
  const [razao, setRazao] = useState(cliente?.razao_social ?? '');
  const [documento, setDocumento] = useState('');
  const [responsavel, setResponsavel] = useState(cliente?.responsavel ?? '');
  const [cro, setCro] = useState(cliente?.cro ?? '');
  const [telefone, setTelefone] = useState('');
  const [email, setEmail] = useState(cliente?.email ?? '');
  const [cidade, setCidade] = useState(cliente?.endereco?.cidade ?? '');
  const [uf, setUf] = useState(cliente?.endereco?.uf ?? '');
  const [pagamento, setPagamento] = useState(cliente?.condicao_pagamento ?? '');
  const [ativo, setAtivo] = useState(cliente?.ativo ?? true);

  const doc = soDigitos(documento);
  const tel = soDigitos(telefone);
  const docOk = !doc || doc.length === 11 || doc.length === 14;
  const telOk = !tel || tel.length === 10 || tel.length === 11;

  const salvar = useMutation({
    mutationFn: () => {
      const body: LabClienteEntrada = {
        razao_social: razao.trim(),
        responsavel: responsavel.trim() || null,
        cro: cro.trim() || null,
        email: email.trim() || null,
        endereco:
          cidade.trim() || uf.trim()
            ? { ...(cliente?.endereco ?? {}), cidade: cidade.trim(), uf: uf.trim().toUpperCase() }
            : null,
        condicao_pagamento: pagamento.trim() || null,
      };
      if (doc) body.documento = doc;
      if (tel) body.telefone = tel;
      if (!cliente) return chamar(api.POST('/laboratorio/clientes', { body }));
      if (cliente.tipo === 'externo') body.ativo = ativo;
      return chamar(
        api.PATCH('/laboratorio/clientes/{id}', { params: { path: { id: cliente.id } }, body }),
      );
    },
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: ['lab-clientes'] });
      avisar(cliente ? 'Cliente atualizado.' : 'Caderno criado.', 'ok');
      onFechar();
      aoSalvar?.(c.id);
    },
    onError: (e) => setErro(mensagemDeErro(e)),
  });

  return (
    <Overlay
      tipo="drawer"
      titulo={cliente ? 'Editar cliente' : 'Novo cliente'}
      descricao={
        cliente ? undefined : 'Cada cliente ganha um caderno próprio de ordens de serviço.'
      }
      onFechar={onFechar}
      rodape={
        <>
          <Button variante="secondary" onClick={onFechar}>
            Cancelar
          </Button>
          <Button
            disabled={razao.trim().length < 2 || !docOk || !telOk}
            carregando={salvar.isPending}
            onClick={() => {
              setErro(null);
              salvar.mutate();
            }}
          >
            Salvar
          </Button>
        </>
      }
    >
      <div className="stack">
        {erro && (
          <div className="alert" role="alert">
            {erro}
          </div>
        )}
        <label className="field">
          <span className="label">Razão social ou nome</span>
          <input
            className="input"
            maxLength={160}
            value={razao}
            onChange={(e) => setRazao(e.target.value)}
          />
        </label>
        <div className="form-grid">
          <label className="field">
            <span className="label">CNPJ ou CPF</span>
            <input
              className="input"
              inputMode="numeric"
              placeholder={cliente?.documento ?? '00.000.000/0000-00'}
              aria-invalid={!docOk}
              value={documento}
              onChange={(e) => setDocumento(mascaraDocumento(e.target.value))}
            />
            {cliente?.documento && (
              <span className="hint">Deixe em branco para manter o atual.</span>
            )}
          </label>
          <label className="field">
            <span className="label">Telefone</span>
            <input
              className="input"
              inputMode="tel"
              placeholder={cliente?.telefone ?? '(00) 00000-0000'}
              aria-invalid={!telOk}
              value={telefone}
              onChange={(e) => setTelefone(mascaraCelular(e.target.value))}
            />
            {cliente?.telefone && (
              <span className="hint">Deixe em branco para manter o atual.</span>
            )}
          </label>
          <label className="field">
            <span className="label">Responsável</span>
            <input
              className="input"
              maxLength={120}
              value={responsavel}
              onChange={(e) => setResponsavel(e.target.value)}
            />
          </label>
          <label className="field">
            <span className="label">CRO</span>
            <input
              className="input"
              maxLength={30}
              value={cro}
              onChange={(e) => setCro(e.target.value)}
            />
          </label>
          <label className="field">
            <span className="label">E-mail</span>
            <input
              className="input"
              type="email"
              maxLength={254}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="field">
            <span className="label">Condição de pagamento</span>
            <input
              className="input"
              maxLength={80}
              placeholder="Ex.: 30 dias"
              value={pagamento}
              onChange={(e) => setPagamento(e.target.value)}
            />
          </label>
          <label className="field">
            <span className="label">Cidade</span>
            <input
              className="input"
              maxLength={80}
              value={cidade}
              onChange={(e) => setCidade(e.target.value)}
            />
          </label>
          <label className="field">
            <span className="label">UF</span>
            <input
              className="input"
              maxLength={2}
              value={uf}
              onChange={(e) => setUf(e.target.value)}
            />
          </label>
        </div>
        {cliente?.tipo === 'externo' && (
          <label className="check">
            <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
            Cliente ativo (inativo não recebe nova OS)
          </label>
        )}
      </div>
    </Overlay>
  );
}
