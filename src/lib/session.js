'use strict';
/**
 * Sessao stateless assinada em cookie (HMAC-SHA256).
 * Motivo: o Render Free hiberna/reinicia a instancia; sessao em memoria cairia
 * a cada restart e uma tabela de sessao exigiria dependencia extra.
 * O cookie guarda apenas id, nome, perfil, expiracao e o token CSRF.
 */
const crypto = require('crypto');
const config = require('../config');

const COOKIE = 'ceramica_sid';
const COOKIE_CSRF = 'ceramica_csrf'; // token para formularios sem sessao (login)

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const sign = (data) => crypto.createHmac('sha256', config.sessionSecret).update(data).digest('base64url');

function serialize(payload) {
  const body = b64u(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
}

function parse(token) {
  if (!token || typeof token !== 'string') return null;
  const i = token.lastIndexOf('.');
  if (i < 1) return null;
  const body = token.slice(0, i);
  const sig = token.slice(i + 1);
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(body));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!payload || typeof payload.exp !== 'number' || Date.now() > payload.exp) return null;
  return payload;
}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProd, // no Render todo trafego e HTTPS
    path: '/',
    maxAge: config.sessionHours * 3600 * 1000,
  };
}

function start(res, usuario) {
  const payload = {
    uid: usuario.id,
    nome: usuario.nome,
    perfil: usuario.perfil,
    csrf: crypto.randomBytes(24).toString('base64url'),
    exp: Date.now() + config.sessionHours * 3600 * 1000,
  };
  res.cookie(COOKIE, serialize(payload), cookieOptions());
  return payload;
}

function destroy(res) {
  const o = cookieOptions();
  delete o.maxAge;
  res.clearCookie(COOKIE, o);
}

module.exports = { COOKIE, COOKIE_CSRF, start, destroy, parse, serialize, cookieOptions };
