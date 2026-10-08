import { useState } from 'react';
import { Abas } from '../../components/Abas';
import { AuditoriaTab } from './AuditoriaTab';
import { PermissoesTab } from './PermissoesTab';
import { ProfissionaisTab } from './ProfissionaisTab';
import { UsuariosTab } from './UsuariosTab';

export function AdminPage({ unidade }: { unidade: 'clinica' | 'laboratorio' }) {
  const abas =
    unidade === 'clinica'
      ? [
          { id: 'usuarios', rotulo: 'Usuários' },
          { id: 'profissionais', rotulo: 'Profissionais e jornada' },
          { id: 'auditoria', rotulo: 'Auditoria' },
        ]
      : [
          { id: 'usuarios', rotulo: 'Usuários' },
          { id: 'permissoes', rotulo: 'Permissões do Laboratório' },
          { id: 'auditoria', rotulo: 'Auditoria' },
        ];
  const [aba, setAba] = useState('usuarios');

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>
            {unidade === 'clinica'
              ? 'Equipe e auditoria — Clínica'
              : 'Equipe e permissões — Laboratório'}
          </h1>
          <p>Você administra apenas os usuários e registros da sua unidade.</p>
        </div>
      </div>
      <Abas abas={abas} ativa={aba} onMudar={setAba} />
      {aba === 'usuarios' && <UsuariosTab unidade={unidade} />}
      {aba === 'profissionais' && <ProfissionaisTab />}
      {aba === 'permissoes' && <PermissoesTab />}
      {aba === 'auditoria' && <AuditoriaTab />}
    </div>
  );
}
