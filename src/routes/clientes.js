'use strict';
const express = require('express');
const db = require('../db');
const auditoria = require('../lib/auditoria');
const { campos, idParam } = require('../lib/validate');
const paginacao = require('../lib/paginacao');
const { exigirPermissao } = require('../middleware/auth');

const router = express.Router();

// ------------------------------- lista -------------------------------
router.get('/', exigirPermissao('clientes:ver'), async (req, res, next) => {
  try {
    const busca = String(req.query.busca || '').trim().slice(0, 80);
    const { pagina, limit, offset } = paginacao.ler(req);
    const filtro = busca ? 'WHERE c.nome ILIKE $1 OR c.telefone ILIKE $1 OR c.cidade ILIKE $1' : '';
    const params = busca ? [`%${busca}%`] : [];

    const total = Number(await db.valor(`SELECT COUNT(*)::int FROM clientes c ${filtro}`, params));
    const clientes = await db.muitos(
      `SELECT c.id, c.nome, c.telefone, c.endereco, c.cidade, c.ativo,
              COUNT(p.id)::int AS total_pedidos
         FROM clientes c
         LEFT JOIN pedidos p ON p.cliente_id = c.id
         ${filtro}
         GROUP BY c.id
         ORDER BY c.nome
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    res.render('clientes/lista', {
      titulo: 'Clientes',
      clientes,
      busca,
      nav: paginacao.montar(req, pagina, limit, total),
    });
  } catch (err) { next(err); }
});

// ------------------------------- form --------------------------------
router.get('/novo', exigirPermissao('clientes:editar'), (req, res) => {
  res.render('clientes/form', { titulo: 'Novo cliente', cliente: {}, erros: [] });
});

router.get('/:id/editar', exigirPermissao('clientes:editar'), async (req, res, next) => {
  try {
    const id = idParam(req.params.id);
    if (!id) return res.status(404).render('erro', { titulo: 'Não encontrado', codigo: 404, mensagem: 'Este cliente não existe.' });
    const cliente = await db.um('SELECT * FROM clientes WHERE id = $1', [id]);
    if (!cliente) return res.status(404).render('erro', { titulo: 'Não encontrado', codigo: 404, mensagem: 'Este cliente não existe.' });
    res.render('clientes/form', { titulo: `Editar ${cliente.nome}`, cliente, erros: [] });
  } catch (err) { next(err); }
});

// ------------------------------ detalhe ------------------------------
router.get('/:id', exigirPermissao('clientes:ver'), async (req, res, next) => {
  try {
    const id = idParam(req.params.id);
    if (!id) return res.status(404).render('erro', { titulo: 'Não encontrado', codigo: 404, mensagem: 'Este cliente não existe.' });

    const cliente = await db.um('SELECT * FROM clientes WHERE id = $1', [id]);
    if (!cliente) return res.status(404).render('erro', { titulo: 'Não encontrado', codigo: 404, mensagem: 'Este cliente não existe.' });

    const pedidos = await db.muitos(
      `SELECT p.id, p.data_pedido, p.data_entrega, p.status, p.valor_total
         FROM pedidos p WHERE p.cliente_id = $1
        ORDER BY p.criado_em DESC LIMIT 30`,
      [id]
    );
    const resumo = await db.um(
      `SELECT COUNT(*)::int AS total,
              COALESCE(SUM(valor_total) FILTER (WHERE status <> 'cancelado'), 0) AS valor,
              COUNT(*) FILTER (WHERE status NOT IN ('entregue','cancelado'))::int AS abertos
         FROM pedidos WHERE cliente_id = $1`,
      [id]
    );

    res.render('clientes/detalhe', { titulo: cliente.nome, cliente, pedidos, resumo });
  } catch (err) { next(err); }
});

// ------------------------------ gravar -------------------------------
function validar(body) {
  return campos(body)
    .texto('nome', 'Nome', { min: 3, max: 140 })
    .telefone('telefone', 'Telefone')
    .texto('endereco', 'Endereco', { min: 5, max: 255 })
    .texto('cidade', 'Cidade', { obrigatorio: false, max: 90 });
}

router.post('/', exigirPermissao('clientes:editar'), async (req, res, next) => {
  try {
    const f = validar(req.body);
    if (!f.ok) {
      return res.status(400).render('clientes/form', {
        titulo: 'Novo cliente', cliente: req.body, erros: f.erros,
      });
    }
    const novo = await db.um(
      'INSERT INTO clientes (nome, telefone, endereco, cidade) VALUES ($1, $2, $3, $4) RETURNING id',
      [f.dados.nome, f.dados.telefone, f.dados.endereco, f.dados.cidade]
    );
    await auditoria.registrar(req, {
      acao: auditoria.ACOES.CRIAR, entidade: 'cliente', entidadeId: novo.id, detalhe: f.dados.nome,
    });
    res.redirect(`/clientes/${novo.id}?ok=Cliente cadastrado com sucesso.`);
  } catch (err) { next(err); }
});

router.post('/:id', exigirPermissao('clientes:editar'), async (req, res, next) => {
  try {
    const id = idParam(req.params.id);
    if (!id) return res.status(404).render('erro', { titulo: 'Não encontrado', codigo: 404, mensagem: 'Este cliente não existe.' });

    const f = validar(req.body);
    const ativo = String(req.body.ativo || '') === 'on';
    if (!f.ok) {
      return res.status(400).render('clientes/form', {
        titulo: 'Editar cliente', cliente: { ...req.body, id }, erros: f.erros,
      });
    }
    const r = await db.query(
      'UPDATE clientes SET nome=$1, telefone=$2, endereco=$3, cidade=$4, ativo=$5 WHERE id=$6',
      [f.dados.nome, f.dados.telefone, f.dados.endereco, f.dados.cidade, ativo, id]
    );
    if (!r.rowCount) return res.status(404).render('erro', { titulo: 'Não encontrado', codigo: 404, mensagem: 'Este cliente não existe.' });

    await auditoria.registrar(req, {
      acao: auditoria.ACOES.ALTERAR, entidade: 'cliente', entidadeId: id, detalhe: f.dados.nome,
    });
    res.redirect(`/clientes/${id}?ok=Cliente atualizado com sucesso.`);
  } catch (err) { next(err); }
});

module.exports = router;
