require('dotenv').config();

const app = require('./app');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`QuickOdonto API rodando na porta ${PORT}`);
  console.log(`Swagger UI em http://localhost:${PORT}/api-docs`);
});
