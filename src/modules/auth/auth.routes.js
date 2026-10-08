const express = require('express');
const { z } = require('zod');
const cfg = require('../../config/auth');
const { authMiddleware } = require('../../middleware/auth');
const { csrfMiddleware, gerarCsrf } = require('../../middleware/csrf');
const { limitadorAuth } = require('../../middleware/rateLimit');
const { senhaForte } = require('../../lib/senha');
const service = require('./auth.service');

const router = express.Router();

const limitador = limitadorAuth;

const loginSchema = z.object({
  email: z.string().email().max(254),
  senha: z.string().min(1).max(200),
});

const ctxDe = (req) => ({ ip: req.ip, userAgent: req.get('user-agent') });

function gravarCookies(res, { access, refresh }) {
  res.cookie(cfg.ACCESS_COOKIE, access, cfg.opcoesCookie({ path: '/', maxAge: 15 * 60 * 1000 }));
  res.cookie(
    cfg.REFRESH_COOKIE,
    refresh,
    cfg.opcoesCookie({ path: cfg.REFRESH_PATH, maxAge: cfg.REFRESH_DIAS * 86400000 }),
  );
}

function limparCookies(res) {
  res.clearCookie(cfg.ACCESS_COOKIE, cfg.opcoesCookie({ path: '/' }));
  res.clearCookie(cfg.REFRESH_COOKIE, cfg.opcoesCookie({ path: cfg.REFRESH_PATH }));
}

/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: Autenticação e sessão (cookies httpOnly)
 * /auth/login:
 *   post:
 *     summary: Autentica e abre a sessão (cookies httpOnly)
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, senha]
 *             properties:
 *               email: { type: string, format: email }
 *               senha: { type: string }
 *     responses:
 *       200: { description: Autenticado; cookies qo_at e qo_rt definidos }
 *       400: { description: Payload inválido }
 *       401: { description: Credenciais inválidas }
 *       423: { description: Conta bloqueada temporariamente }
 *       429: { description: Limite de requisições excedido }
 */
router.post('/login', limitador, async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ erro: 'Dados inválidos.' });

    const { usuario, access, refresh } = await service.login(
      parsed.data.email,
      parsed.data.senha,
      ctxDe(req),
    );
    gravarCookies(res, { access, refresh });
    return res.json({
      usuario: {
        id: usuario.id,
        nome: usuario.nome,
        perfil: usuario.perfil,
        unidade: usuario.unidade,
      },
      csrfToken: gerarCsrf(access),
    });
  } catch (err) {
    return next(err);
  }
});

/**
 * @swagger
 * /auth/refresh:
 *   post:
 *     summary: Renova a sessão (refresh rotativo, via cookie qo_rt)
 *     tags: [Auth]
 *     responses:
 *       200: { description: Sessão renovada; cookies reemitidos e novo csrfToken no corpo }
 *       401: { description: Refresh inválido, expirado ou inativo por mais de 30 min }
 */
router.post('/refresh', limitador, async (req, res, next) => {
  try {
    const tokens = await service.renovar(req.cookies[cfg.REFRESH_COOKIE], ctxDe(req));
    gravarCookies(res, tokens);
    return res.json({ csrfToken: gerarCsrf(tokens.access) });
  } catch (err) {
    if (err.status === 401) limparCookies(res);
    return next(err);
  }
});

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     summary: Revoga a sessão e limpa os cookies
 *     tags: [Auth]
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       204: { description: Sessão encerrada }
 *       401: { description: Não autenticado }
 *       403: { description: Token CSRF ausente ou inválido (header X-CSRF-Token) }
 */
router.post('/logout', authMiddleware, csrfMiddleware, async (req, res, next) => {
  try {
    await service.logout(req.cookies[cfg.REFRESH_COOKIE]);
    limparCookies(res);
    return res.status(204).end();
  } catch (err) {
    return next(err);
  }
});

/**
 * @swagger
 * /auth/me:
 *   get:
 *     summary: Usuário logado e suas permissões
 *     tags: [Auth]
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       200: { description: Dados mínimos do usuário e permissões do perfil }
 *       401: { description: Não autenticado }
 */
router.get('/me', authMiddleware, async (req, res, next) => {
  try {
    const { id, nome, perfil, unidade } = req.usuario;
    res.set('Cache-Control', 'no-store');
    return res.json({
      id,
      nome,
      perfil,
      unidade,
      permissoes: await service.permissoesDoPerfil(perfil),
      // Restaura o token CSRF do front após recarregar a página (ele vive só em memória).
      csrfToken: gerarCsrf(
        req.cookies[cfg.ACCESS_COOKIE] || (req.get('authorization') || '').slice(7),
      ),
    });
  } catch (err) {
    return next(err);
  }
});

/**
 * @swagger
 * /auth/esqueci-senha:
 *   post:
 *     summary: Envia link de redefinição (resposta igual exista ou não o e-mail)
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, format: email }
 *     responses:
 *       204: { description: Solicitação aceita }
 *       400: { description: Payload inválido }
 *       429: { description: Limite de requisições excedido }
 */
router.post('/esqueci-senha', limitador, async (req, res, next) => {
  try {
    const parsed = z.object({ email: z.string().email().max(254) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ erro: 'Dados inválidos.' });
    await service.solicitarRedefinicao(parsed.data.email);
    return res.status(204).end();
  } catch (err) {
    return next(err);
  }
});

/**
 * @swagger
 * /auth/redefinir-senha:
 *   post:
 *     summary: Redefine a senha com o token recebido por e-mail (uso único)
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, novaSenha]
 *             properties:
 *               token: { type: string }
 *               novaSenha: { type: string, minLength: 10 }
 *     responses:
 *       204: { description: Senha redefinida; sessões anteriores revogadas }
 *       400: { description: Token inválido/expirado ou senha fora da política }
 *       429: { description: Limite de requisições excedido }
 */
router.post('/redefinir-senha', limitador, async (req, res, next) => {
  try {
    const parsed = z
      .object({ token: z.string().min(10).max(200), novaSenha: senhaForte })
      .safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ erro: parsed.error.issues[0]?.message || 'Dados inválidos.' });
    }
    await service.redefinirSenha(parsed.data.token, parsed.data.novaSenha);
    limparCookies(res);
    return res.status(204).end();
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
