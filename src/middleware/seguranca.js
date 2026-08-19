'use strict';
/**
 * Camada de seguranca sem dependencias externas:
 *  - cabecalhos de resposta (CSP, nosniff, frame, referrer, HSTS)
 *  - rate limiting em memoria (global e especifico de login)
 *  - protecao CSRF por token de dupla verificacao ligado a sessao
 */
const crypto = require('crypto');
const config = require('../config');

// --------------------------- cabecalhos ---------------------------
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "object-src 'none'",
].join('; ');

function cabecalhos(req, res, next) {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), payment=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.removeHeader('X-Powered-By');
  if (config.isProd) {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }
  next();
}

// ------------------------- rate limiting --------------------------
/**
 * Contador em memoria. Suficiente para uma instancia unica (Render Free).
 * Em multi-instancia, trocar por Redis mantendo esta mesma interface.
 */
class Contador {
  constructor(limpezaMs = 10 * 60 * 1000) {
    this.mapa = new Map();
    const t = setInterval(() => this.limpar(), limpezaMs);
    if (t.unref) t.unref();
  }
  limpar() {
    const agora = Date.now();
    for (const [k, v] of this.mapa) if (v.expira <= agora) this.mapa.delete(k);
    // trava de memoria: nunca deixa o mapa crescer sem limite
    if (this.mapa.size > 20000) this.mapa.clear();
  }
  bater(chave, janelaMs) {
    const agora = Date.now();
    const atual = this.mapa.get(chave);
    if (!atual || atual.expira <= agora) {
      const novo = { total: 1, expira: agora + janelaMs };
      this.mapa.set(chave, novo);
      return novo;
    }
    atual.total += 1;
    return atual;
  }
  ler(chave) {
    const atual = this.mapa.get(chave);
    if (!atual || atual.expira <= Date.now()) return null;
    return atual;
  }
  zerar(chave) {
    this.mapa.delete(chave);
  }
}

const contadorGlobal = new Contador();
const contadorLogin = new Contador();

const ipDe = (req) => (req.ip || req.connection?.remoteAddress || 'desconhecido').replace('::ffff:', '');

/** Limite geral por IP, para conter varredura e abuso. */
function limiteGlobal({ max = 300, janelaMs = 60 * 1000 } = {}) {
  return (req, res, next) => {
    if (req.path === '/healthz') return next();
    const r = contadorGlobal.bater(`g:${ipDe(req)}`, janelaMs);
    if (r.total > max) {
      res.setHeader('Retry-After', Math.ceil((r.expira - Date.now()) / 1000));
      return res.status(429).send('Muitas requisições. Tente novamente em instantes.');
    }
    next();
  };
}

const LOGIN_MAX = 5;
const LOGIN_JANELA_MS = 15 * 60 * 1000;

/** Bloqueia tentativas excessivas de login por IP e por IP+email. */
function limiteLogin(req, res, next) {
  const email = String(req.body?.email || '').toLowerCase().slice(0, 180);
  const chaves = [`ip:${ipDe(req)}`, `id:${ipDe(req)}|${email}`];
  for (const chave of chaves) {
    const atual = contadorLogin.ler(chave);
    if (atual && atual.total >= LOGIN_MAX) {
      const segundos = Math.ceil((atual.expira - Date.now()) / 1000);
      const minutos = Math.max(1, Math.ceil(segundos / 60));
      return res.status(429).render('login', {
        titulo: 'Entrar',
        erro: `Muitas tentativas de login. Aguarde ${minutos} minuto(s) e tente novamente.`,
        email,
        proximo: String(req.body?.proximo || ''),
      });
    }
  }
  req._chavesLogin = chaves;
  next();
}

function registrarFalhaLogin(req) {
  for (const chave of req._chavesLogin || []) contadorLogin.bater(chave, LOGIN_JANELA_MS);
}

function limparFalhasLogin(req) {
  for (const chave of req._chavesLogin || []) contadorLogin.zerar(chave);
}

// ----------------------------- CSRF -------------------------------
/**
 * O token vive dentro do cookie de sessao assinado. Todo POST compara o campo
 * do formulario com o token da sessao usando comparacao de tempo constante.
 */
function verificarCsrf(req, res, next) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();

  const daSessao = req.sessao?.csrf || req.csrfAnonimo;
  const doForm = String(req.body?._csrf || req.get('x-csrf-token') || '');
  if (!daSessao || !doForm) return recusar(res);

  const a = Buffer.from(daSessao);
  const b = Buffer.from(doForm);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return recusar(res);

  // Verificacao de origem: defesa adicional contra POST de outro site.
  const origem = req.get('origin');
  if (origem) {
    let host;
    try { host = new URL(origem).host; } catch { return recusar(res); }
    if (host !== req.get('host')) return recusar(res);
  }
  next();
}

function recusar(res) {
  return res.status(403).render('erro', {
    titulo: 'Sessão expirada',
    codigo: 403,
    mensagem: 'A sessão expirou ou o formulário perdeu a validade. Entre novamente e repita a ação.',
  });
}

module.exports = {
  cabecalhos,
  limiteGlobal,
  limiteLogin,
  registrarFalhaLogin,
  limparFalhasLogin,
  verificarCsrf,
  ipDe,
};
