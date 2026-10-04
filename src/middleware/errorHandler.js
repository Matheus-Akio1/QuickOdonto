/**
 * Handler final de erros. Loga o detalhe internamente e responde algo genérico —
 * o cliente nunca recebe stack trace nem mensagem interna (RF de segurança, seção 3).
 */
function errorHandler(err, req, res, _next) {
  console.error(`[erro] ${req.method} ${req.originalUrl} ->`, err);

  const status = err.status || 500;
  const mensagem = status < 500 ? err.message : 'Erro interno. Tente novamente mais tarde.';

  res.status(status).json({ erro: mensagem });
}

module.exports = errorHandler;
