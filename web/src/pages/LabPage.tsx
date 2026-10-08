import { Vazio } from '../components/Feedback';

export function LabPage() {
  return (
    <div className="page">
      <div className="page-head">
        <h1>Laboratório</h1>
      </div>
      <div className="card">
        <Vazio titulo="Produção do laboratório em breve">
          O Kanban de ordens de serviço, o estoque e os clientes entram no marco M3.
        </Vazio>
      </div>
    </div>
  );
}
