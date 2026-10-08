const swaggerJsdoc = require('swagger-jsdoc');
const { aplicarContrato } = require('./openapi-contrato');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'QuickOdonto API',
      version: '0.1.0',
      description: 'Contrato entre backend, frontend web e, na fase 2, o app nativo.',
    },
    servers: [{ url: '/api/v1' }],
    components: {
      securitySchemes: {
        cookieAuth: { type: 'apiKey', in: 'cookie', name: 'qo_at' },
      },
    },
  },
  apis: ['./src/modules/**/*.routes.js'],
};

module.exports = aplicarContrato(swaggerJsdoc(options));
