const nodemailer = require('nodemailer');

let transporte;

function obterTransporte() {
  if (!transporte) {
    transporte = process.env.SMTP_HOST
      ? nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: Number(process.env.SMTP_PORT) || 587,
          auth: process.env.SMTP_USER
            ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
            : undefined,
        })
      : nodemailer.createTransport({ jsonTransport: true });
  }
  return transporte;
}

/** Envia e-mail transacional. Sem SMTP_HOST, nada sai (o conteúdo nunca vai para o log). */
async function enviarEmail({ para, assunto, texto }) {
  if (!process.env.SMTP_HOST) {
    console.warn('[aviso] SMTP_HOST não configurado: e-mail não enviado.');
    return;
  }
  await obterTransporte().sendMail({
    from: process.env.SMTP_FROM,
    to: para,
    subject: assunto,
    text: texto,
  });
}

module.exports = { enviarEmail };
