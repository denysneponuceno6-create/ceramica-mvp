'use strict';
const express = require('express');
const db = require('../db');
const dominio = require('../lib/dominio');
const auditoria = require('../lib/auditoria');
const senhaUtil = require('../lib/password');
const { campos, idParam } = require('../lib/validate');
const paginacao = require('../lib/paginacao');
const { exigirPerfil } = require('../middleware/auth');

// ============================== usuarios ==============================
const usuarios = express.Router();
usuarios.use(exigirPerfil('admin'));

usuarios.get('/', async (req, res, next) => {
  try {
    const lista = await db.muitos(
      'SELECT id, nome, email, perfil, ativo, ultimo_login, criado_em FROM usuarios ORDER BY nome'
    );
    res.render('usuarios/lista', {
      titulo: 'Usuários', usuarios: lista, permissoes: dominio.PERMISSOES,
    });
  } catch (err) { next(err); }
});

usuarios.get('/novo', (req, res) => {
  res.render('usuarios/form', { titulo: 'Novo usuário', usuario: {}, erros: [] });
});

usuarios.get('/:id/editar', async (req, res, next) => {
  try {
    const id = idParam(req.params.id);
    if (!id) return res.status(404).render('erro', { titulo: 'Não encontrado', codigo: 404, mensagem: 'Este usuário não existe.' });
    const usuario = await db.um('SELECT id, nome, email, perfil, ativo FROM usuarios WHERE id = $1', [id]);
    if (!usuario) return res.status(404).render('erro', { titulo: 'Não encontrado', codigo: 404, mensagem: 'Este usuário não existe.' });
    res.render('usuarios/form', { titulo: `Editar ${usuario.nome}`, usuario, erros: [] });
  } catch (err) { next(err); }
});

usuarios.post('/', async (req, res, next) => {
  try {
    const f = campos(req.body)
      .texto('nome', 'Nome', { min: 3, max: 120 })
      .email('email', 'E-mail')
      .opcao('perfil', 'Perfil', dominio.PERFIS)
      .senha('senha', 'Senha');

    if (!f.ok) return res.status(400).render('usuarios/form', { titulo: 'Novo usuário', usuario: req.body, erros: f.erros });

    const existe = await db.um('SELECT id FROM usuarios WHERE LOWER(email) = $1', [f.dados.email]);
    if (existe) {
      return res.status(400).render('usuarios/form', {
        titulo: 'Novo usuário', usuario: req.body, erros: ['Já existe um usuário com esse e-mail.'],
      });
    }

    const hash = await senhaUtil.hash(f.dados.senha);
    const novo = await db.um(
      'INSERT INTO usuarios (nome, email, senha_hash, perfil) VALUES ($1,$2,$3,$4) RETURNING id',
      [f.dados.nome, f.dados.email, hash, f.dados.perfil]
    );
    await auditoria.registrar(req, {
      acao: auditoria.ACOES.CRIAR, entidade: 'usuario', entidadeId: novo.id,
      detalhe: `${f.dados.email} (${f.dados.perfil})`,
    });
    res.redirect('/usuarios?ok=Usuário criado com sucesso.');
  } catch (err) { next(err); }
});

usuarios.post('/:id', async (req, res, next) => {
  try {
    const id = idParam(req.params.id);
    if (!id) return res.status(404).render('erro', { titulo: 'Não encontrado', codigo: 404, mensagem: 'Este usuário não existe.' });

    const f = campos(req.body)
      .texto('nome', 'Nome', { min: 3, max: 120 })
      .email('email', 'E-mail')
      .opcao('perfil', 'Perfil', dominio.PERFIS)
      .senha('senha', 'Senha', { obrigatorio: false });

    const ativo = String(req.body.ativo || '') === 'on';

    // Um administrador nao pode se rebaixar ou se desativar sozinho.
    if (id === req.sessao.uid && (f.dados.perfil !== 'admin' || !ativo)) {
      f.erros.push('Voce nao pode remover o proprio acesso de administrador.');
    }
    if (!f.ok) {
      return res.status(400).render('usuarios/form', { titulo: 'Editar usuário', usuario: { ...req.body, id }, erros: f.erros });
    }

    const outro = await db.um('SELECT id FROM usuarios WHERE LOWER(email) = $1 AND id <> $2', [f.dados.email, id]);
    if (outro) {
      return res.status(400).render('usuarios/form', {
        titulo: 'Editar usuário', usuario: { ...req.body, id }, erros: ['Esse e-mail já pertence a outro usuário.'],
      });
    }

    const r = await db.query('UPDATE usuarios SET nome=$1, email=$2, perfil=$3, ativo=$4 WHERE id=$5',
      [f.dados.nome, f.dados.email, f.dados.perfil, ativo, id]);
    if (!r.rowCount) return res.status(404).render('erro', { titulo: 'Não encontrado', codigo: 404, mensagem: 'Este usuário não existe.' });

    if (f.dados.senha) {
      const hash = await senhaUtil.hash(f.dados.senha);
      await db.query('UPDATE usuarios SET senha_hash = $1 WHERE id = $2', [hash, id]);
    }

    await auditoria.registrar(req, {
      acao: auditoria.ACOES.ALTERAR, entidade: 'usuario', entidadeId: id,
      detalhe: `${f.dados.email} (${f.dados.perfil})${f.dados.senha ? ' - senha redefinida' : ''}`,
    });
    res.redirect('/usuarios?ok=Usuário atualizado com sucesso.');
  } catch (err) { next(err); }
});

// ============================== auditoria =============================
const logs = express.Router();
logs.use(exigirPerfil('admin'));

logs.get('/', async (req, res, next) => {
  try {
    const { pagina, limit, offset } = paginacao.ler(req);
    const acao = String(req.query.acao || '').trim().slice(0, 40);
    const params = [];
    let filtro = '';
    if (acao) { params.push(acao); filtro = `WHERE l.acao = $${params.length}`; }

    const total = Number(await db.valor(`SELECT COUNT(*)::int FROM logs l ${filtro}`, params));
    const registros = await db.muitos(
      `SELECT l.id, l.usuario_nome, l.acao, l.entidade, l.entidade_id, l.detalhe, l.ip, l.criado_em
         FROM logs l ${filtro}
        ORDER BY l.criado_em DESC, l.id DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );
    const acoes = await db.muitos('SELECT DISTINCT acao FROM logs ORDER BY acao');

    res.render('auditoria/lista', {
      titulo: 'Auditoria', registros, acoes, acao,
      nav: paginacao.montar(req, pagina, limit, total),
    });
  } catch (err) { next(err); }
});

module.exports = { usuarios, logs };
