// Testes rodam num banco próprio, nunca no de desenvolvimento.
process.env.DB_NAME = 'quickodonto_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'segredo-de-teste';
process.env.APP_URL = 'http://localhost:5173';
process.env.SMTP_HOST = '';
// Chaves fixas só para teste (nunca as de dev/produção).
process.env.ENC_KEY = Buffer.alloc(32, 7).toString('base64');
process.env.HMAC_KEY = Buffer.alloc(32, 9).toString('base64');
// Anexos de teste vão para uma pasta temporária, nunca para o volume de desenvolvimento.
process.env.STORAGE_DIR = require('path').join(require('os').tmpdir(), 'quickodonto-anexos-teste');
