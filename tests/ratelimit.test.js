process.env.AUTH_RATE_LIMIT = '3';

const request = require('supertest');
const app = require('../src/app');
const { pool } = require('../src/config/db');

afterAll(() => pool.end());

test('rate limit: a 4ª requisição em /auth/login devolve 429', async () => {
  const codigos = [];
  for (let i = 0; i < 4; i += 1) {
    const res = await request(app).post('/api/v1/auth/login').send({});
    codigos.push(res.status);
  }
  expect(codigos).toEqual([400, 400, 400, 429]);
});
