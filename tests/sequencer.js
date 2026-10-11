const Sequencer = require('@jest/test-sequencer').default;

/**
 * Ordem alfabética e determinística. As suítes compartilham o banco de teste e o prontuário
 * (M4) cria registros que, por regra (RN-006/RN-009), não podem ser apagados — então as suítes
 * anteriores precisam limpar o que criaram antes do m4 rodar.
 */
class SequenciaAlfabetica extends Sequencer {
  sort(testes) {
    return [...testes].sort((a, b) => a.path.localeCompare(b.path));
  }
}

module.exports = SequenciaAlfabetica;
