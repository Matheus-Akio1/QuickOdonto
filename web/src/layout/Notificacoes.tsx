import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { api, chamar } from '../api/client';
import { Button } from '../components/Button';
import { IconeSino } from '../components/Icones';
import { fmtDataHora } from '../lib/datas';

export function Notificacoes() {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ['notificacoes'],
    queryFn: () => chamar(api.GET('/notificacoes')),
    refetchInterval: 60_000,
  });
  const marcar = useMutation({
    mutationFn: (id: string) =>
      chamar(api.PATCH('/notificacoes/{id}/lida', { params: { path: { id } } })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notificacoes'] }),
  });

  useEffect(() => {
    if (!aberto) return undefined;
    const fora = (e: MouseEvent) => !caixa.current?.contains(e.target as Node) && setAberto(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setAberto(false);
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', fora);
      document.removeEventListener('keydown', esc);
    };
  }, [aberto]);

  const naoLidas = data?.nao_lidas ?? 0;
  return (
    <div className="pop-wrap" ref={caixa}>
      <Button
        variante="ghost"
        className="btn-icon"
        aria-label={`Notificações${naoLidas ? `, ${naoLidas} não lidas` : ''}`}
        aria-expanded={aberto}
        onClick={() => setAberto((v) => !v)}
      >
        <IconeSino />
        {naoLidas > 0 && <span className="contador">{naoLidas}</span>}
      </Button>
      {aberto && (
        <div className="popover" role="region" aria-label="Notificações">
          {!data?.itens.length && <p className="empty">Nenhuma notificação.</p>}
          {data?.itens.map((n) => (
            <div key={n.id} className={`item ${n.lida_em ? '' : 'nova'}`}>
              <div style={{ flex: 1 }}>
                <strong>{n.titulo}</strong>
                <div className="muted">{fmtDataHora(n.criado_em)}</div>
              </div>
              {!n.lida_em && (
                <Button variante="ghost" pequeno onClick={() => marcar.mutate(n.id)}>
                  Marcar lida
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
