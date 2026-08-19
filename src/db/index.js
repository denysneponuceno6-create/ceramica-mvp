'use strict';
/**
 * Acesso ao PostgreSQL. Todas as consultas usam parametros ($1, $2, ...):
 * nenhuma string de usuario e concatenada em SQL (protecao contra SQL Injection).
 */
const { Pool } = require('pg');
const config = require('../config');

const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: config.databaseSsl ? { rejectUnauthorized: false } : false,
  max: 5,                      // instancia free tem pouca memoria e o Postgres free poucas conexoes
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  application_name: 'ceramica-mvp',
});

pool.on('error', (err) => {
  console.error('[db] erro no cliente ocioso:', err.message);
});

async function query(text, params = []) {
  const inicio = Date.now();
  const res = await pool.query(text, params);
  const ms = Date.now() - inicio;
  if (ms > 500) console.warn(`[db] consulta lenta (${ms}ms): ${text.slice(0, 80).replace(/\s+/g, ' ')}`);
  return res;
}

/** Primeira linha ou null. */
async function um(text, params = []) {
  const res = await query(text, params);
  return res.rows[0] || null;
}

/** Todas as linhas. */
async function muitos(text, params = []) {
  const res = await query(text, params);
  return res.rows;
}

/** Escalar da primeira coluna da primeira linha. */
async function valor(text, params = []) {
  const row = await um(text, params);
  if (!row) return null;
  return row[Object.keys(row)[0]];
}

/**
 * Executa fn dentro de uma transacao. Commit no sucesso, rollback no erro.
 * Uso: await transacao(async (c) => { await c.query(...); });
 */
async function transacao(fn) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const resultado = await fn(cliente);
    await cliente.query('COMMIT');
    return resultado;
  } catch (err) {
    try { await cliente.query('ROLLBACK'); } catch { /* conexao ja perdida */ }
    throw err;
  } finally {
    cliente.release();
  }
}

async function saudavel() {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

module.exports = { pool, query, um, muitos, valor, transacao, saudavel };
