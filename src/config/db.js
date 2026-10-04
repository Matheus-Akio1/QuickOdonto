const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

pool.on('error', (err) => {
  console.error('Erro inesperado no pool do Postgres:', err.message);
});

/**
 * Sempre parametrizado: query(text, [valores]) — nunca concatenar valor na string SQL.
 */
function query(text, params) {
  return pool.query(text, params);
}

module.exports = { pool, query };
