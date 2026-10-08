/**
 * Marca no schema a classificação de segurança das colunas (seção 3.1), para que ninguém
 * crie índice ou relatório sobre o valor em claro de um campo cifrado.
 */
exports.up = (knex) =>
  knex.raw(`
    COMMENT ON COLUMN pacientes.cpf_cifrado IS 'CIFRADO (AES-256-GCM, v1). Nunca filtrar/ordenar/indexar.';
    COMMENT ON COLUMN pacientes.cpf_hash IS 'HASH DE BUSCA (HMAC-SHA256, HMAC_KEY). Usar p/ busca exata e unicidade do CPF.';
    COMMENT ON COLUMN pacientes.observacoes_cifrado IS 'CIFRADO (AES-256-GCM, v1). Texto livre tratado como clínico.';
    COMMENT ON COLUMN pacientes.celular IS 'EM CLARO (só dígitos). Mascarado nas respostas da API.';
    COMMENT ON COLUMN usuarios.senha_hash IS 'HASH bcrypt (custo 10+). Nunca reversível.';
    COMMENT ON COLUMN sessoes.refresh_hash IS 'HASH SHA-256 do refresh token. O valor em claro só existe no cookie.';
    COMMENT ON COLUMN tokens_senha.token_hash IS 'HASH SHA-256 do token enviado por e-mail.';
    COMMENT ON COLUMN profissionais.cro IS 'EM CLARO: registro público do conselho (decisão registrada).';
  `);

exports.down = (knex) =>
  knex.raw(`
    COMMENT ON COLUMN pacientes.cpf_cifrado IS NULL;
    COMMENT ON COLUMN pacientes.cpf_hash IS NULL;
    COMMENT ON COLUMN pacientes.observacoes_cifrado IS NULL;
    COMMENT ON COLUMN pacientes.celular IS NULL;
    COMMENT ON COLUMN usuarios.senha_hash IS NULL;
    COMMENT ON COLUMN sessoes.refresh_hash IS NULL;
    COMMENT ON COLUMN tokens_senha.token_hash IS NULL;
    COMMENT ON COLUMN profissionais.cro IS NULL;
  `);
