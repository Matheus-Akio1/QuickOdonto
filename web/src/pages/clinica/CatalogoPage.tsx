import { CatalogoProcedimentos } from './CatalogoProcedimentos';

export function CatalogoPage() {
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Procedimentos</h1>
          <p>
            Catálogo usado no odontograma e nos planos de tratamento. Itens inativos saem das listas
            de escolha.
          </p>
        </div>
      </div>
      <CatalogoProcedimentos />
    </div>
  );
}
