const ACCESS_COOKIE = 'qo_at';
const REFRESH_COOKIE = 'qo_rt';
const REFRESH_PATH = '/api/v1/auth';

const MAX_TENTATIVAS = 5;
const BLOQUEIO_MINUTOS = 15;
const INATIVIDADE_MINUTOS = 30;
const REFRESH_DIAS = 7;

function jwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET não configurado.');
  return secret;
}

function opcoesCookie(extra = {}) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    ...extra,
  };
}

module.exports = {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  REFRESH_PATH,
  MAX_TENTATIVAS,
  BLOQUEIO_MINUTOS,
  INATIVIDADE_MINUTOS,
  REFRESH_DIAS,
  jwtSecret,
  opcoesCookie,
};
