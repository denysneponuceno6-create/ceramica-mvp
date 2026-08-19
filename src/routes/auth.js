'use strict';
const express = require('express');
const db = require('../db');
const senhaUtil = require('../lib/password');
const sessao = require('../lib/session');
const auditoria = require('../lib/auditoria');
const { campos } = require('../lib/validate');
const seg = require('../middleware/seguranca');

const router = express.Router();

router.get('/login', (req, res) => {
  if (req.sessao) return res.redirect('/');
  res.render('login', { titulo: 'Entrar', erro: null, email: '', proximo: String(req.query.proximo || '') });
});

router.post('/login', seg.limiteLogin, async (req, res, next) => {
  try {
    const f = campos(req.body).email('email', 'E-mail').texto('senha', 'Senha', { max: 200 });
    const email = f.dados.email || '';

    // Mensagem unica para credencial invalida: nao revela se o e-mail existe.
    const falhar = async (motivo) => {
      seg.registrarFalhaLogin(req);
      await auditoria.registrar(req, {
        acao: auditoria.ACOES.LOGIN_FALHA,
        entidade: 'usuario',
        detalhe: `${motivo} (${email || 'sem e-mail'})`,
        usuario: { id: null, nome: 'anonimo' },
      });
      return res.status(401).render('login', {
        titulo: 'Entrar',
        erro: 'E-mail ou senha incorretos.',
        email,
        proximo: String(req.body.proximo || ''),
      });
    };

    if (!f.ok) return falhar('dados invalidos');

    const usuario = await db.um(
      'SELECT id, nome, email, senha_hash, perfil, ativo FROM usuarios WHERE LOWER(email) = $1',
      [email]
    );

    if (!usuario) {
      // Gasta tempo semelhante ao de uma verificacao real (mitiga enumeracao por tempo).
      await senhaUtil.verify(f.dados.senha, 'scrypt$32768$8$1$00$00');
      return falhar('usuario inexistente');
    }
    if (!usuario.ativo) return falhar('usuario inativo');

    const confere = await senhaUtil.verify(f.dados.senha, usuario.senha_hash);
    if (!confere) return falhar('senha incorreta');

    seg.limparFalhasLogin(req);
    sessao.start(res, usuario);
    await db.query('UPDATE usuarios SET ultimo_login = NOW() WHERE id = $1', [usuario.id]);
    await auditoria.registrar(req, {
      acao: auditoria.ACOES.LOGIN,
      entidade: 'usuario',
      entidadeId: usuario.id,
      detalhe: `Perfil ${usuario.perfil}`,
      usuario: { id: usuario.id, nome: usuario.nome },
    });

    // So aceita redirecionamento interno (bloqueia open redirect).
    const proximo = String(req.body.proximo || '');
    const destino = /^\/(?!\/)[\w\-/?=&.%]*$/.test(proximo) ? proximo : '/';
    return res.redirect(destino);
  } catch (err) {
    next(err);
  }
});

router.post('/logout', async (req, res, next) => {
  try {
    if (req.sessao) {
      await auditoria.registrar(req, { acao: auditoria.ACOES.LOGOUT, entidade: 'usuario', entidadeId: req.sessao.uid });
    }
    sessao.destroy(res);
    res.redirect('/login');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
