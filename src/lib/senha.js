const { z } = require('zod');

/** Política de senha: 10+ caracteres com minúscula, maiúscula e número. */
const senhaForte = z
  .string()
  .min(10, 'A senha deve ter ao menos 10 caracteres.')
  .max(128)
  .regex(/[a-z]/, 'A senha deve ter letra minúscula.')
  .regex(/[A-Z]/, 'A senha deve ter letra maiúscula.')
  .regex(/[0-9]/, 'A senha deve ter número.');

module.exports = { senhaForte };
