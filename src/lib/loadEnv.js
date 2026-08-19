'use strict';
/**
 * Leitor minimo de arquivo .env (substitui a dependencia dotenv).
 * Nunca sobrescreve variaveis ja definidas pelo ambiente (Render tem prioridade).
 */
const fs = require('fs');
const path = require('path');

module.exports = function loadEnv(file) {
  const target = file || path.resolve(process.cwd(), '.env');
  let raw;
  try {
    raw = fs.readFileSync(target, 'utf8');
  } catch {
    return false; // sem .env: comportamento normal em producao
  }
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 1) continue;
    const key = t.slice(0, i).trim();
    let value = t.slice(i + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
  return true;
};
