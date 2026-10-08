const PDFDocument = require('pdfkit');
const { query } = require('../../config/db');
const { mascararCpf } = require('../../lib/mascara');
const { decifrar } = require('../../lib/crypto');
const prontuario = require('./prontuario.service');
const procedimentos = require('./procedimentos.service');

const fmt = (d) =>
  new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(d));
const fmtData = (d) => (d ? d.split('-').reverse().join('/') : '—');
const STATUS = {
  planejado: 'Planejado',
  em_andamento: 'Em andamento',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
};

/**
 * PDF do prontuário gerado no backend (seção 3.2): o front nunca monta documento com dado clínico.
 * CPF sai mascarado; o conteúdo clínico é decifrado só em memória para compor o arquivo.
 */
async function gerarPdfProntuario(pacienteId, emitidoPor) {
  const resumo = await prontuario.resumoProntuario(pacienteId);
  const cpf = await query('SELECT cpf_cifrado FROM pacientes WHERE id = $1', [pacienteId]);
  const anamnese = resumo.anamnese_atual
    ? await prontuario.buscarAnamnese(resumo.anamnese_atual.id)
    : null;
  const evolucoes = await prontuario.listarEvolucoes(pacienteId, { pagina: 1, limite: 500 });
  const procs = await procedimentos.listarProcedimentos(pacienteId);

  const doc = new PDFDocument({
    size: 'A4',
    margin: 48,
    info: { Title: 'Prontuário odontológico' },
  });
  const partes = [];
  doc.on('data', (b) => partes.push(b));
  const fim = new Promise((resolve) => doc.on('end', () => resolve(Buffer.concat(partes))));

  const p = resumo.paciente;
  doc.font('Helvetica-Bold').fontSize(18).text('Prontuário odontológico');
  doc.moveDown(0.3).font('Helvetica').fontSize(10).fillColor('#444');
  doc.text(
    `Emitido em ${fmt(new Date())} por ${emitidoPor}. Documento confidencial — acesso registrado.`,
  );
  doc.moveDown().fillColor('#000').fontSize(12).font('Helvetica-Bold').text(p.nome);
  doc.font('Helvetica').fontSize(10);
  doc.text(
    `Prontuário nº ${p.numero_prontuario} · Nascimento ${fmtData(p.nascimento)} · CPF ${
      cpf.rows[0]?.cpf_cifrado ? mascararCpf(decifrar(cpf.rows[0].cpf_cifrado)) : '—'
    }`,
  );

  const secao = (titulo) => {
    doc.moveDown(1).font('Helvetica-Bold').fontSize(13).fillColor('#1a6b5e').text(titulo);
    doc.fillColor('#000').font('Helvetica').fontSize(10).moveDown(0.3);
  };

  secao('Alertas clínicos');
  if (!resumo.alertas?.length) doc.text('Nenhum alerta registrado.');
  for (const a of resumo.alertas ?? []) doc.text(`• ${a.tipo}: ${a.descricao}`);

  secao('Anamnese atual');
  if (!anamnese) doc.text('Nenhuma anamnese registrada.');
  else {
    doc.text(
      `Versão ${anamnese.versao} · ${anamnese.profissional_nome} · ${fmt(anamnese.criado_em)} · ${
        anamnese.assinada_em ? `assinada em ${fmt(anamnese.assinada_em)}` : 'NÃO ASSINADA'
      }`,
    );
    for (const [k, v] of Object.entries(anamnese.respostas ?? {})) {
      const valor = Array.isArray(v)
        ? v.join(', ')
        : typeof v === 'boolean'
          ? v
            ? 'Sim'
            : 'Não'
          : String(v);
      doc.text(`${k.replace(/_/g, ' ')}: ${valor}`);
    }
  }

  secao('Evoluções');
  if (!evolucoes.itens.length) doc.text('Nenhuma evolução registrada.');
  for (const e of [...evolucoes.itens].reverse()) {
    doc.font('Helvetica-Bold').text(`${fmt(e.criado_em)} — ${e.profissional_nome}`);
    doc.font('Helvetica').text(e.conteudo);
    for (const a of e.adendos)
      doc
        .fillColor('#555')
        .text(`Adendo ${fmt(a.criado_em)} (${a.profissional_nome}): ${a.conteudo}`);
    doc.fillColor('#000').moveDown(0.4);
  }

  secao('Procedimentos');
  if (!procs.length) doc.text('Nenhum procedimento registrado.');
  for (const pr of procs) {
    doc.text(
      `${fmtData(pr.data)} · ${pr.catalogo.nome}${pr.dente ? ` · dente ${pr.dente}` : ''}${
        pr.faces.length ? ` (${pr.faces.join('')})` : ''
      } · ${STATUS[pr.status]}${pr.profissional_nome ? ` · ${pr.profissional_nome}` : ''}`,
    );
    for (const a of pr.adendos)
      doc
        .fillColor('#555')
        .text(`   Adendo ${fmt(a.criado_em)}: ${a.conteudo}`)
        .fillColor('#000');
  }

  doc.end();
  return fim;
}

module.exports = { gerarPdfProntuario };
