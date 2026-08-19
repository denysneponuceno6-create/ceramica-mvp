'use strict';
/**
 * Parser de cookies minimo (substitui a dependencia cookie-parser).
 * Preenche req.cookies.
 */
module.exports = function cookies(req, res, next) {
  const header = req.headers.cookie;
  req.cookies = {};
  if (!header) return next();
  for (const parte of header.split(';')) {
    const i = parte.indexOf('=');
    if (i < 1) continue;
    const nome = parte.slice(0, i).trim();
    let valor = parte.slice(i + 1).trim();
    try { valor = decodeURIComponent(valor); } catch { /* mantem bruto */ }
    if (req.cookies[nome] === undefined) req.cookies[nome] = valor;
  }
  next();
};
