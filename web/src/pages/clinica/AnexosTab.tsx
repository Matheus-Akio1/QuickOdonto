import { useMutation, useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { api, chamar, mensagemDeErro } from '../../api/client';
import type { Anexo } from '../../api/types';
import { Button } from '../../components/Button';
import { Carregando, ErroCarga, Vazio } from '../../components/Feedback';
import { Overlay } from '../../components/Overlay';
import { fmtDataHora } from '../../lib/datas';
import { useToast } from '../../toast/useToast';
import { chave, CLINICO, useInvalidarProntuario } from './useProntuario';

const TIPOS = {
  radiografia: 'Radiografia',
  foto: 'Foto',
  documento: 'Documento',
  escaneamento: 'Escaneamento',
  outro: 'Outro',
} as const;
const MAX = 50 * 1024 * 1024;
const ACEITOS = 'image/jpeg,image/png,image/webp,application/pdf';
const tamanho = (b: number) =>
  b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.ceil(b / 1024)} KB`;

export function AnexosTab({ pacienteId }: { pacienteId: string }) {
  const { avisar } = useToast();
  const invalidar = useInvalidarProntuario(pacienteId);
  const input = useRef<HTMLInputElement>(null);
  const [tipo, setTipo] = useState<keyof typeof TIPOS>('radiografia');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [previa, setPrevia] = useState<{ nome: string; url: string } | null>(null);

  const lista = useQuery({
    queryKey: chave(pacienteId, 'anexos'),
    queryFn: () =>
      chamar(api.GET('/pacientes/{id}/anexos', { params: { path: { id: pacienteId } } })),
    ...CLINICO,
  });

  const enviar = useMutation({
    mutationFn: () =>
      chamar(
        api.POST('/pacientes/{id}/anexos', {
          params: { path: { id: pacienteId } },
          // O contrato tipa os campos; o serializador monta o multipart (o navegador define o boundary).
          body: { tipo, arquivo: arquivo as unknown as string },
          bodySerializer: (b) => {
            const form = new FormData();
            form.append('tipo', b.tipo);
            form.append('arquivo', b.arquivo as unknown as Blob);
            return form;
          },
        }),
      ),
    onSuccess: () => {
      setArquivo(null);
      if (input.current) input.current.value = '';
      invalidar();
      avisar('Anexo enviado e armazenado cifrado.', 'ok');
    },
    onError: (e) => avisar(mensagemDeErro(e), 'erro'),
  });

  // Cada visualização pede um link novo (uso único, 60 s): imagem abre na prévia; PDF é baixado.
  const abrir = useMutation({
    mutationFn: (a: Anexo) => chamar(api.GET('/anexos/{id}', { params: { path: { id: a.id } } })),
    onSuccess: (r) => {
      if (r.mime.startsWith('image/')) setPrevia({ nome: r.nome, url: r.url });
      else window.location.assign(r.url);
    },
    onError: (e) => avisar(mensagemDeErro(e), 'erro'),
  });

  const escolher = (f: File | null) => {
    if (f && f.size > MAX) {
      avisar('Arquivo acima de 50 MB.', 'erro');
      if (input.current) input.current.value = '';
      return;
    }
    setArquivo(f);
  };

  return (
    <div className="stack">
      <section className="card">
        <h2 style={{ marginBottom: 10 }}>Enviar anexo</h2>
        <div className="form-grid">
          <label className="field">
            <span className="label">Arquivo (JPG, PNG, WEBP ou PDF até 50 MB)</span>
            <input
              ref={input}
              className="input"
              type="file"
              accept={ACEITOS}
              onChange={(e) => escolher(e.target.files?.[0] ?? null)}
            />
          </label>
          <label className="field">
            <span className="label">Tipo</span>
            <select
              className="select"
              value={tipo}
              onChange={(e) => setTipo(e.target.value as keyof typeof TIPOS)}
            >
              {Object.entries(TIPOS).map(([v, r]) => (
                <option key={v} value={v}>
                  {r}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="row" style={{ marginTop: 10, justifyContent: 'space-between' }}>
          <span className="muted">
            O servidor confere o conteúdo real do arquivo e o guarda cifrado.
          </span>
          <Button disabled={!arquivo} carregando={enviar.isPending} onClick={() => enviar.mutate()}>
            Enviar
          </Button>
        </div>
      </section>

      {lista.error ? (
        <ErroCarga erro={lista.error} onTentar={() => lista.refetch()} />
      ) : !lista.data ? (
        <Carregando />
      ) : !lista.data.length ? (
        <div className="card">
          <Vazio titulo="Nenhum anexo" />
        </div>
      ) : (
        <div className="anexos-grid">
          {lista.data.map((a) => (
            <article key={a.id} className="card" style={{ padding: 14 }}>
              <span className="badge badge-info">{TIPOS[a.tipo]}</span>
              <p style={{ margin: '8px 0 4px', wordBreak: 'break-word' }}>
                <strong>{a.nome}</strong>
              </p>
              <p className="muted">
                {tamanho(a.tamanho)} · {fmtDataHora(a.criado_em)}
                {a.enviado_por ? ` · ${a.enviado_por}` : ''}
              </p>
              <Button
                variante="secondary"
                pequeno
                style={{ marginTop: 8 }}
                carregando={abrir.isPending && abrir.variables?.id === a.id}
                onClick={() => abrir.mutate(a)}
              >
                {a.mime.startsWith('image/') ? 'Visualizar' : 'Baixar'}
              </Button>
            </article>
          ))}
        </div>
      )}

      {previa && (
        <Overlay
          titulo={previa.nome}
          descricao="Link de uso único: para ver de novo, abra outra vez."
          onFechar={() => setPrevia(null)}
          largo
        >
          <img className="previa-anexo" src={previa.url} alt={`Anexo: ${previa.nome}`} />
        </Overlay>
      )}
    </div>
  );
}
