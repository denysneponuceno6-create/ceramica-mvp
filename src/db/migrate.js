'use strict';
/**
 * Aplica o schema. Idempotente: seguro rodar a cada boot no Render.
 * Uso: npm run migrate  (ou automatico via AUTO_MIGRATE=true)
 */
const fs = require('fs');
const path = require('path');
const db = require('./index');

async function migrar() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await db.query(sql);
  return true;
}

module.exports = { migrar };

// Execucao direta pela linha de comando
if (require.main === module) {
  migrar()
    .then(() => {
      console.log('[migrate] schema aplicado com sucesso.');
      return db.pool.end();
    })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[migrate] falhou:', err.message);
      process.exit(1);
    });
}
