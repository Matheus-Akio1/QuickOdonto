const express = require('express');
const { z } = require('zod');
const { query } = require('../../config/db');
const { authMiddleware, permitirPerfis } = require('../../middleware/auth');
const { csrfMiddleware } = require('../../middleware/csrf');
const { auditar } = require('../../middleware/auditoria');

const router = express.Router();

router.use(
  authMiddleware,
  csrfMiddleware,
  permitirPerfis(['adm_clinica', 'adm_laboratorio']),
  auditar,
);

// Perfis que têm permissões configuráveis, a unidade dona e as chaves aceitas (RF-ADL-032).
const CONFIGURAVEIS = {
  laboratorio: {
    unidade: 'laboratorio',
    chaves: ['entrada_estoque', 'criar_os_externa', 'cancelar_os'],
  },
};

/** RN-014 — o administrador só configura perfis da própria unidade. */
function resolverPerfil(req, res) {
  const cfg = CONFIGURAVEIS[req.params.perfil];
  if (!cfg || cfg.unidade !== req.usuario.unidade) {
    res.status(404).json({ erro: 'Perfil não encontrado.' });
    return null;
  }
  return cfg;
}

async function ler(perfil, chaves) {
  const { rows } = await query(
    'SELECT chave, habilitado FROM perfis_permissoes WHERE perfil = $1',
    [perfil],
  );
  const atual = Object.fromEntries(rows.map((r) => [r.chave, r.habilitado]));
  return Object.fromEntries(chaves.map((c) => [c, atual[c] === true]));
}

/**
 * @swagger
 * /perfis/{perfil}/permissoes:
 *   get:
 *     summary: Permissões configuráveis do perfil (hoje, só Laboratório)
 *     tags: [Perfis]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: path, name: perfil, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: Mapa chave → habilitado }
 *       404: { description: Perfil inexistente ou de outra unidade }
 *   put:
 *     summary: Substitui as permissões do perfil
 *     tags: [Perfis]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: path, name: perfil, required: true, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               permissoes:
 *                 type: object
 *                 additionalProperties: { type: boolean }
 *                 example: { entrada_estoque: true, criar_os_externa: false, cancelar_os: false }
 *     responses:
 *       200: { description: Permissões gravadas }
 *       400: { description: Chave desconhecida }
 *       404: { description: Perfil inexistente ou de outra unidade }
 */
router.get('/:perfil/permissoes', async (req, res, next) => {
  try {
    const cfg = resolverPerfil(req, res);
    if (!cfg) return undefined;
    res.set('Cache-Control', 'no-store');
    return res.json({
      perfil: req.params.perfil,
      permissoes: await ler(req.params.perfil, cfg.chaves),
    });
  } catch (err) {
    return next(err);
  }
});

router.put('/:perfil/permissoes', async (req, res, next) => {
  try {
    const cfg = resolverPerfil(req, res);
    if (!cfg) return undefined;
    const schema = z.object({ permissoes: z.record(z.string(), z.boolean()) }).strict();
    const r = schema.safeParse(req.body);
    const desconhecida =
      r.success && Object.keys(r.data.permissoes).find((k) => !cfg.chaves.includes(k));
    if (!r.success || desconhecida) {
      return res.status(400).json({
        erro: desconhecida ? `Permissão desconhecida: ${desconhecida}.` : 'Dados inválidos.',
      });
    }

    const antes = await ler(req.params.perfil, cfg.chaves);
    for (const [chave, habilitado] of Object.entries(r.data.permissoes)) {
      await query(
        `INSERT INTO perfis_permissoes (perfil, chave, habilitado) VALUES ($1,$2,$3)
         ON CONFLICT (perfil, chave) DO UPDATE SET habilitado = EXCLUDED.habilitado, atualizado_em = now()`,
        [req.params.perfil, chave, habilitado],
      );
    }
    const depois = await ler(req.params.perfil, cfg.chaves);
    res.locals.auditoria = {
      entidade: 'perfis_permissoes',
      entidadeId: req.params.perfil,
      acao: 'editar',
      antes,
      depois,
    };
    return res.json({ perfil: req.params.perfil, permissoes: depois });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
