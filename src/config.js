'use strict';
/**
 * Configuracao central. Tudo vem de variaveis de ambiente.
 * Nenhum segredo pode existir literalmente no codigo.
 */
const crypto = require('crypto');

// Carrega .env sem dependencia externa (dotenv nao e necessario).
require('./lib/loadEnv')();

const bool = (v, def = false) => {
  if (v === undefined || v === '') return def;
  return ['1', 'true', 'yes', 'on', 'sim'].includes(String(v).toLowerCase());
};

const NODE_ENV = process.env.NODE_ENV || 'development';
const isProd = NODE_ENV === 'production';

let sessionSecret = process.env.SESSION_SECRET || '';
if (sessionSecret.length < 32) {
  if (isProd) {
    console.error('[FATAL] SESSION_SECRET ausente ou com menos de 32 caracteres.');
    console.error('        Gere com: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"');
    process.exit(1);
  }
  sessionSecret = crypto.randomBytes(48).toString('hex');
  console.warn('[aviso] SESSION_SECRET nao definido. Usando chave temporaria (as sessoes caem a cada restart).');
}

if (!process.env.DATABASE_URL) {
  console.error('[FATAL] DATABASE_URL nao definida. Configure a conexao PostgreSQL.');
  process.exit(1);
}

module.exports = {
  env: NODE_ENV,
  isProd,
  port: Number(process.env.PORT) || 3000,
  databaseUrl: process.env.DATABASE_URL,
  databaseSsl: bool(process.env.DATABASE_SSL, isProd),
  sessionSecret,
  sessionHours: Number(process.env.SESSION_HOURS) || 8,
  autoMigrate: bool(process.env.AUTO_MIGRATE, true),
  autoSeed: bool(process.env.AUTO_SEED, true),
  trustProxy: bool(process.env.TRUST_PROXY, isProd),
  adminEmail: (process.env.ADMIN_EMAIL || 'admin@ceramica.local').toLowerCase().trim(),
  adminPassword: process.env.ADMIN_PASSWORD || '',
  pageSize: 20,
};
