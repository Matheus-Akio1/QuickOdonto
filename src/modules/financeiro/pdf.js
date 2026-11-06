const PDFDocument = require('pdfkit');
const { query } = require('../../config/db');
const service = require('./financeiro.service');

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtData = (d) => (d ? d.split('-').reverse().join('/') : '—');
const agora = () =>
  new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date());
const FORMA = {
  pix: 'Pix',
  dinheiro: 'Dinheiro',
  credito: 'Cartão de crédito',
  debito: 'Cartão de débito',
  boleto: 'Boleto',
  transferencia: 'Transferência',
};

function novoDocumento(titulo) {
  const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: titulo } });
  const partes = [];
  doc.on('data', (b) => partes.push(b));
  const fim = new Promise((resolve) => doc.on('end', () => resolve(Buffer.concat(partes))));
  return { doc, fim };
}

/**
 * Recibo gerado no backend (seção 3.2): o front só recebe o link de uso único.
 * Só existe para receita da clínica com dinheiro efetivamente recebido.
 */
async function gerarRecibo(lancamentoId, usuario) {
  const l = await service.buscar(lancamentoId, usuario);
  if (l.tipo !== 'receita') throw service.erro(409, 'Recibo só existe para receitas.');
  if (!(l.valor_pago > 0)) throw service.erro(409, 'Este lançamento ainda não tem valor recebido.');
  const { doc, fim } = novoDocumento('Recibo');
  doc.font('Helvetica-Bold').fontSize(20).text('Recibo');
  doc.moveDown(0.3).font('Helvetica').fontSize(10).fillColor('#444');
  doc.text(`QuickOdonto · emitido em ${agora()} por ${usuario.nome}`);
  doc.moveDown(1.5).fillColor('#000').fontSize(12);
  doc.text(
    `Recebemos${l.paciente ? ` de ${l.paciente.nome}` : ''} a quantia de ${BRL.format(l.valor_pago)}, referente a: ${l.descricao}.`,
    { lineGap: 4 },
  );
  doc.moveDown().fontSize(11).font('Helvetica-Bold').text('Pagamentos');
  doc.font('Helvetica').fontSize(10);
  for (const b of l.baixas) {
    doc.text(`${fmtData(b.data)}  ·  ${FORMA[b.forma] ?? b.forma}  ·  ${BRL.format(b.valor)}`);
  }
  if (l.saldo > 0) {
    doc
      .moveDown(0.5)
      .text(`Saldo em aberto: ${BRL.format(l.saldo)} (vencimento ${fmtData(l.vencimento)}).`);
  }
  doc.moveDown(3).text('______________________________________', { align: 'center' });
  doc.text('QuickOdonto', { align: 'center' });
  doc.end();
  return fim;
}

/** Extrato mensal de serviços de um cliente do laboratório (prancha "extrato do cliente"). */
async function gerarExtrato(clienteId, mes, emitidoPor) {
  const e = await service.extrato(clienteId, mes);
  const { doc, fim } = novoDocumento('Extrato de serviços');
  doc.font('Helvetica-Bold').fontSize(18).text('Extrato de serviços');
  doc.moveDown(0.3).font('Helvetica').fontSize(10).fillColor('#444');
  doc.text(`Laboratório QuickOdonto · emitido em ${agora()} por ${emitidoPor}`);
  doc.moveDown().fillColor('#000').font('Helvetica-Bold').fontSize(13).text(e.cliente.razao_social);
  doc.font('Helvetica').fontSize(10);
  const doc1 = e.cliente.documento
    ? `${e.cliente.documento_tipo === 'cpf' ? 'CPF' : 'CNPJ'} ${e.cliente.documento}`
    : null;
  doc.text([doc1, e.cliente.responsavel, e.cliente.cro].filter(Boolean).join(' · ') || ' ');
  doc.text(
    `Período: ${fmtData(e.inicio)} a ${fmtData(e.fim)} · ${e.os_concluidas} OS concluídas · Total ${BRL.format(e.total)}`,
  );

  doc.moveDown().font('Helvetica-Bold').fontSize(11).text('Ordens de serviço concluídas');
  doc.font('Helvetica').fontSize(9);
  if (!e.itens.length) doc.text('Nenhuma OS concluída no período.');
  for (const o of e.itens) {
    const dentes = o.elementos.length ? ` · ${o.elementos.join(', ')}` : '';
    doc.text(
      `${fmtData(o.data)}   ${o.numero}   ${o.paciente}   ${o.tipo_trabalho}${dentes}   ${
        o.valor === null ? 'sem preço' : BRL.format(o.valor)
      }`,
    );
  }
  doc.moveDown().font('Helvetica-Bold').fontSize(11).text('Resumo por procedimento');
  doc.font('Helvetica').fontSize(9);
  for (const r of e.resumo) {
    doc.text(`${r.tipo_trabalho}   ${r.quantidade}×   ${BRL.format(r.total)}`);
  }
  doc.moveDown().font('Helvetica-Bold').fontSize(11).text('Pagamento');
  doc.font('Helvetica').fontSize(10);
  doc.text(`Recebido: ${BRL.format(e.pagamento.recebido)}`);
  doc.text(
    `A receber: ${BRL.format(e.pagamento.a_receber)}${
      e.pagamento.vencimento ? ` · vencimento ${fmtData(e.pagamento.vencimento)}` : ''
    }`,
  );
  doc.end();
  return fim;
}

/** Conteúdo de um link de recibo/extrato: revalida o usuário e a unidade no momento do resgate. */
async function conteudoDoLink(link) {
  const { rows } = await query(
    "SELECT id, nome, perfil, unidade FROM usuarios WHERE id = $1 AND status = 'ativo'",
    [link.usuario_id],
  );
  const usuario = rows[0];
  if (!usuario) return null;
  if (link.tipo === 'recibo_pdf') {
    if (usuario.perfil !== 'adm_clinica') return null;
    return { dados: await gerarRecibo(link.referencia_id, usuario), nome: 'recibo.pdf', usuario };
  }
  if (usuario.perfil !== 'adm_laboratorio') return null;
  return {
    dados: await gerarExtrato(link.referencia_id, link.parametro, usuario.nome),
    nome: 'extrato.pdf',
    usuario,
  };
}

module.exports = { gerarRecibo, gerarExtrato, conteudoDoLink };
