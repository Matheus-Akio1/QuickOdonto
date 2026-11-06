import { Cabecalho } from '../../layout/Cabecalho';
import { CatalogoProcedimentos } from './CatalogoProcedimentos';

export function CatalogoPage() {
  return (
    <>
      <Cabecalho trilha="Clínica / Procedimentos" titulo="Procedimentos" />
      <div className="content">
        <p className="muted" style={{ marginTop: -8 }}>
          Catálogo usado no odontograma e nos planos de tratamento. Itens inativos saem das listas
          de escolha.
        </p>
        <CatalogoProcedimentos />
      </div>
    </>
  );
}
