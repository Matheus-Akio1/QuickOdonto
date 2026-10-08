/**
 * Handler final de erros. Loga o detalhe internamente e responde algo genérico —
 * o cliente nunca recebe stack trace nem mensagem interna (RF de segurança, seção 3).
 */
function errorHandler(err, req, res, _next) {
  const status = err.status || 500;
  if (status >= 500) {
    console.error(`[erro] ${req.method} ${req.originalUrl} ->`, err);
  } else {
    console.warn(`[aviso] ${req.method} ${req.originalUrl} -> ${status} ${err.message}`);
  }

  const mensagem = status < 500 ? err.message : 'Erro interno. Tente novamente mais tarde.';

  res.status(status).json({ erro: mensagem });
}

module.exports = errorHandler;
