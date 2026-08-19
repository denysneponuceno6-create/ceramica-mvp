'use strict';
/**
 * Hash de senha com scrypt (RFC 7914) do modulo crypto nativo do Node.
 * Escolhido no lugar de bcrypt/argon2 para nao exigir compilacao nativa
 * no Render Free e nao adicionar dependencias. Parametros: N=2^15, r=8, p=1.
 * Formato armazenado: scrypt$N$r$p$saltHex$hashHex
 */
const crypto = require('crypto');

const N = 32768;
const r = 8;
const p = 1;
const KEYLEN = 32;
const MAXMEM = 96 * 1024 * 1024;

function hash(senha) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16);
    crypto.scrypt(String(senha), salt, KEYLEN, { N, r, p, maxmem: MAXMEM }, (err, dk) => {
      if (err) return reject(err);
      resolve(`scrypt$${N}$${r}$${p}$${salt.toString('hex')}$${dk.toString('hex')}`);
    });
  });
}

function verify(senha, armazenado) {
  return new Promise((resolve) => {
    if (typeof armazenado !== 'string') return resolve(false);
    const parts = armazenado.split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') return resolve(false);
    const [, n, rr, pp, saltHex, hashHex] = parts;
    let salt, esperado;
    try {
      salt = Buffer.from(saltHex, 'hex');
      esperado = Buffer.from(hashHex, 'hex');
    } catch {
      return resolve(false);
    }
    crypto.scrypt(
      String(senha), salt, esperado.length,
      { N: Number(n), r: Number(rr), p: Number(pp), maxmem: MAXMEM },
      (err, dk) => {
        if (err) return resolve(false);
        resolve(dk.length === esperado.length && crypto.timingSafeEqual(dk, esperado));
      }
    );
  });
}

module.exports = { hash, verify };
