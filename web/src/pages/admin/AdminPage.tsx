import { useState } from 'react';
import { Abas } from '../../components/Abas';
import { Cabecalho } from '../../layout/Cabecalho';
import { CatalogoProcedimentos } from '../clinica/CatalogoProcedimentos';
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
          { id: 'catalogo', rotulo: 'Catálogo de procedimentos' },
          { id: 'auditoria', rotulo: 'Auditoria' },
        ]
      : [
          { id: 'usuarios', rotulo: 'Usuários' },
          { id: 'permissoes', rotulo: 'Permissões do Laboratório' },
          { id: 'auditoria', rotulo: 'Auditoria' },
        ];
  const [aba, setAba] = useState('usuarios');

  return (
    <>
      <Cabecalho
        trilha={`${unidade === 'clinica' ? 'Adm. Clínica' : 'Adm. Laboratório'} / Usuários`}
        titulo={unidade === 'clinica' ? 'Usuários da clínica' : 'Usuários do laboratório'}
      />
      <div className="content">
        <p className="muted" style={{ marginTop: -8 }}>
          Você administra apenas os usuários e registros da sua unidade.
        </p>
        <Abas abas={abas} ativa={aba} onMudar={setAba} />
        {aba === 'usuarios' && <UsuariosTab unidade={unidade} />}
        {aba === 'profissionais' && <ProfissionaisTab />}
        {aba === 'catalogo' && <CatalogoProcedimentos />}
        {aba === 'permissoes' && <PermissoesTab />}
        {aba === 'auditoria' && <AuditoriaTab />}
      </div>
    </>
  );
}
