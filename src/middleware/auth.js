'use strict';
/**
 * Autenticacao e autorizacao. A checagem acontece SEMPRE no backend:
 * esconder um botao na tela nunca e considerado protecao.
 */
const crypto = require('crypto');
const sessao = require('../lib/session');
const dominio = require('../lib/dominio');

/** Le o cookie assinado e expoe req.sessao / res.locals.usuario. */
function carregarSessao(req, res, next) {
  const payload = sessao.parse(req.cookies?.[sessao.COOKIE]);
  req.sessao = payload;
  res.locals.usuario = payload
    ? { id: payload.uid, nome: payload.nome, perfil: payload.perfil }
    : null;
  // Sem sessao (tela de login) o token vem de um cookie proprio: padrao
  // double-submit cookie. Assim o POST /login tambem fica protegido contra CSRF.
  if (payload) {
    res.locals.csrf = payload.csrf;
  } else {
    let anon = req.cookies?.[sessao.COOKIE_CSRF];
    if (!anon || typeof anon !== 'string' || anon.length < 20 || anon.length > 64) {
      anon = crypto.randomBytes(24).toString('base64url');
      const opcoes = sessao.cookieOptions();
      opcoes.maxAge = 2 * 3600 * 1000;
      res.cookie(sessao.COOKIE_CSRF, anon, opcoes);
    }
    req.csrfAnonimo = anon;
    res.locals.csrf = anon;
  }
  res.locals.pode = (permissao) => (payload ? dominio.pode(payload.perfil, permissao) : false);
  next();
}

/** Exige login. Guarda o destino para retornar depois da autenticacao. */
function exigirLogin(req, res, next) {
  if (req.sessao) return next();
  const destino = req.method === 'GET' ? `?proximo=${encodeURIComponent(req.originalUrl)}` : '';
  return res.redirect(`/login${destino}`);
}

/** Exige uma permissao especifica do perfil. */
function exigirPermissao(permissao) {
  return (req, res, next) => {
    if (!req.sessao) return res.redirect('/login');
    if (dominio.pode(req.sessao.perfil, permissao)) return next();
    return res.status(403).render('erro', {
      titulo: 'Acesso negado',
      codigo: 403,
      mensagem: `Seu perfil (${dominio.ROTULO_PERFIL[req.sessao.perfil] || req.sessao.perfil}) não tem acesso a esta área. Fale com um administrador.`,
    });
  };
}

/** Restringe a rota a perfis especificos (usado na area de usuarios). */
function exigirPerfil(...perfis) {
  return (req, res, next) => {
    if (!req.sessao) return res.redirect('/login');
    if (perfis.includes(req.sessao.perfil)) return next();
    return res.status(403).render('erro', {
      titulo: 'Acesso negado',
      codigo: 403,
      mensagem: 'Esta área é restrita a administradores.',
    });
  };
}

module.exports = { carregarSessao, exigirLogin, exigirPermissao, exigirPerfil };
