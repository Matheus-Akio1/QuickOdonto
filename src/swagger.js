const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'QuickOdonto API',
      version: '0.1.0',
      description: 'Contrato entre backend, frontend web e, na fase 2, o app nativo.',
    },
    servers: [{ url: '/api/v1' }],
  },
  apis: ['./src/modules/**/*.routes.js'],
};

module.exports = swaggerJsdoc(options);
