'use strict';
const express = require('express');
const db = require('../db');
const dominio = require('../lib/dominio');
const auditoria = require('../lib/auditoria');
const { campos, idParam } = require('../lib/validate');
const paginacao = require('../lib/paginacao');
const { exigirPermissao } = require('../middleware/auth');

const router = express.Router();

// ------------------------- posicao de estoque -------------------------
router.get('/', exigirPermissao('estoque:ver'), async (req, res, next) => {
  try {
    const itens = await db.muitos(`
      SELECT p.id, p.nome, p.unidade, p.preco, p.ativo,
             COALESCE(e.quantidade, 0)     AS quantidade,
             COALESCE(e.estoque_minimo, 0) AS estoque_minimo,
             e.atualizado_em,
             (COALESCE(e.quantidade,0) <= COALESCE(e.estoque_minimo,0)) AS alerta
        FROM produtos p
        LEFT JOIN estoque e ON e.produto_id = p.id
       ORDER BY (COALESCE(e.quantidade,0) <= COALESCE(e.estoque_minimo,0)) DESC, p.nome
    `);

    const movimentos = await db.muitos(`
      SELECT m.id, m.tipo, m.quantidade, m.motivo, m.origem, m.pedido_id, m.criado_em,
             p.nome AS produto, u.nome AS usuario
        FROM estoque_movimentos m
        JOIN produtos p ON p.id = m.produto_id
        LEFT JOIN usuarios u ON u.id = m.usuario_id
       ORDER BY m.criado_em DESC, m.id DESC
       LIMIT 15
    `);

    res.render('estoque/lista', { titulo: 'Estoque', itens, movimentos });
  } catch (err) { next(err); }
});

// --------------------------- movimentacao ----------------------------
router.post('/movimento', exigirPermissao('estoque:editar'), async (req, res, next) => {
  try {
    const f = campos(req.body)
      .inteiro('produto_id', 'Produto', { min: 1 })
      .opcao('tipo', 'Tipo', ['entrada', 'saida', 'ajuste'])
      .inteiro('quantidade', 'Quantidade', { min: 1, max: 10000000 })
      .texto('motivo', 'Motivo', { obrigatorio: false, max: 160 });

    if (!f.ok) return res.redirect(`/estoque?err=${encodeURIComponent(f.erros[0])}`);

    const { produto_id, tipo, quantidade, motivo } = f.dados;
    const produto = await db.um('SELECT id, nome FROM produtos WHERE id = $1', [produto_id]);
    if (!produto) return res.redirect('/estoque?err=Produto não encontrado.');

    try {
      await db.transacao(async (c) => {
        await c.query(
          'INSERT INTO estoque (produto_id, quantidade) VALUES ($1, 0) ON CONFLICT (produto_id) DO NOTHING',
          [produto_id]
        );
        const linha = (await c.query('SELECT quantidade FROM estoque WHERE produto_id = $1 FOR UPDATE', [produto_id])).rows[0];
        const atual = linha.quantidade;

        let novo;
        if (tipo === 'entrada') novo = atual + quantidade;
        else if (tipo === 'saida') novo = atual - quantidade;
        else novo = quantidade; // ajuste: define o saldo

        if (novo < 0) {
          const e = new Error(`Saida maior que o saldo. Disponivel: ${atual}.`);
          e.negocio = true;
          throw e;
        }
        await c.query('UPDATE estoque SET quantidade = $1, atualizado_em = NOW() WHERE produto_id = $2', [novo, produto_id]);
        await c.query(
          `INSERT INTO estoque_movimentos (produto_id, tipo, quantidade, motivo, origem, usuario_id)
           VALUES ($1,$2,$3,$4,'manual',$5)`,
          [produto_id, tipo, tipo === 'ajuste' ? Math.max(quantidade, 1) : quantidade,
           motivo || (tipo === 'ajuste' ? `Ajuste de saldo para ${novo}` : null), req.sessao.uid]
        );
      });
    } catch (err) {
      if (err.negocio) return res.redirect(`/estoque?err=${encodeURIComponent(err.message)}`);
      throw err;
    }

    await auditoria.registrar(req, {
      acao: auditoria.ACOES.ESTOQUE, entidade: 'estoque', entidadeId: produto_id,
      detalhe: `${tipo} de ${quantidade} em ${produto.nome}`,
    });
    res.redirect('/estoque?ok=Movimentação registrada com sucesso.');
  } catch (err) { next(err); }
});

// ------------------------- estoque minimo ----------------------------
router.post('/minimo', exigirPermissao('estoque:editar'), async (req, res, next) => {
  try {
    const f = campos(req.body)
      .inteiro('produto_id', 'Produto', { min: 1 })
      .inteiro('estoque_minimo', 'Estoque minimo', { min: 0, max: 10000000 });
    if (!f.ok) return res.redirect(`/estoque?err=${encodeURIComponent(f.erros[0])}`);

    await db.query(
      `INSERT INTO estoque (produto_id, quantidade, estoque_minimo) VALUES ($1, 0, $2)
       ON CONFLICT (produto_id) DO UPDATE SET estoque_minimo = EXCLUDED.estoque_minimo, atualizado_em = NOW()`,
      [f.dados.produto_id, f.dados.estoque_minimo]
    );
    await auditoria.registrar(req, {
      acao: auditoria.ACOES.ALTERAR, entidade: 'estoque', entidadeId: f.dados.produto_id,
      detalhe: `Estoque minimo definido em ${f.dados.estoque_minimo}`,
    });
    res.redirect('/estoque?ok=Estoque mínimo atualizado.');
  } catch (err) { next(err); }
});

// ------------------------- historico completo ------------------------
router.get('/movimentos', exigirPermissao('estoque:ver'), async (req, res, next) => {
  try {
    const { pagina, limit, offset } = paginacao.ler(req);
    const total = Number(await db.valor('SELECT COUNT(*)::int FROM estoque_movimentos'));
    const movimentos = await db.muitos(
      `SELECT m.id, m.tipo, m.quantidade, m.motivo, m.origem, m.pedido_id, m.criado_em,
              p.nome AS produto, u.nome AS usuario
         FROM estoque_movimentos m
         JOIN produtos p ON p.id = m.produto_id
         LEFT JOIN usuarios u ON u.id = m.usuario_id
        ORDER BY m.criado_em DESC, m.id DESC
        LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    res.render('estoque/movimentos', {
      titulo: 'Movimentações de estoque',
      movimentos,
      nav: paginacao.montar(req, pagina, limit, total),
    });
  } catch (err) { next(err); }
});

// ============================== produtos ==============================
const produtos = express.Router();

produtos.get('/', exigirPermissao('produtos:ver'), async (req, res, next) => {
  try {
    const { pagina, limit, offset } = paginacao.ler(req);
    const total = Number(await db.valor('SELECT COUNT(*)::int FROM produtos'));
    const lista = await db.muitos(
      `SELECT p.*, COALESCE(e.quantidade,0) AS saldo, COALESCE(e.estoque_minimo,0) AS minimo
         FROM produtos p LEFT JOIN estoque e ON e.produto_id = p.id
        ORDER BY p.nome LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    res.render('produtos/lista', {
      titulo: 'Produtos', produtos: lista, nav: paginacao.montar(req, pagina, limit, total),
    });
  } catch (err) { next(err); }
});

produtos.get('/novo', exigirPermissao('produtos:editar'), (req, res) => {
  res.render('produtos/form', { titulo: 'Novo produto', produto: {}, erros: [] });
});

produtos.get('/:id/editar', exigirPermissao('produtos:editar'), async (req, res, next) => {
  try {
    const id = idParam(req.params.id);
    if (!id) return res.status(404).render('erro', { titulo: 'Não encontrado', codigo: 404, mensagem: 'Este produto não existe.' });
    const produto = await db.um(
      `SELECT p.*, COALESCE(e.estoque_minimo,0) AS estoque_minimo
         FROM produtos p LEFT JOIN estoque e ON e.produto_id = p.id WHERE p.id = $1`, [id]
    );
    if (!produto) return res.status(404).render('erro', { titulo: 'Não encontrado', codigo: 404, mensagem: 'Este produto não existe.' });
    res.render('produtos/form', { titulo: `Editar ${produto.nome}`, produto, erros: [] });
  } catch (err) { next(err); }
});

function validarProduto(body) {
  return campos(body)
    .texto('nome', 'Nome', { min: 3, max: 140 })
    .texto('unidade', 'Unidade', { min: 1, max: 20 })
    .decimal('preco', 'Preco', { min: 0, max: 9999999 })
    .inteiro('estoque_minimo', 'Estoque minimo', { obrigatorio: false, min: 0, max: 10000000, padrao: 0 });
}

produtos.post('/', exigirPermissao('produtos:editar'), async (req, res, next) => {
  try {
    const f = validarProduto(req.body);
    if (!f.ok) return res.status(400).render('produtos/form', { titulo: 'Novo produto', produto: req.body, erros: f.erros });

    const existe = await db.um('SELECT id FROM produtos WHERE LOWER(nome) = LOWER($1)', [f.dados.nome]);
    if (existe) return res.status(400).render('produtos/form', { titulo: 'Novo produto', produto: req.body, erros: ['Já existe um produto com esse nome.'] });

    const novo = await db.transacao(async (c) => {
      const r = await c.query(
        'INSERT INTO produtos (nome, unidade, preco) VALUES ($1,$2,$3) RETURNING id',
        [f.dados.nome, f.dados.unidade, f.dados.preco]
      );
      await c.query('INSERT INTO estoque (produto_id, quantidade, estoque_minimo) VALUES ($1, 0, $2)',
        [r.rows[0].id, f.dados.estoque_minimo || 0]);
      return r.rows[0].id;
    });

    await auditoria.registrar(req, { acao: auditoria.ACOES.CRIAR, entidade: 'produto', entidadeId: novo, detalhe: f.dados.nome });
    res.redirect('/produtos?ok=Produto cadastrado com sucesso.');
  } catch (err) { next(err); }
});

produtos.post('/:id', exigirPermissao('produtos:editar'), async (req, res, next) => {
  try {
    const id = idParam(req.params.id);
    if (!id) return res.status(404).render('erro', { titulo: 'Não encontrado', codigo: 404, mensagem: 'Este produto não existe.' });

    const f = validarProduto(req.body);
    const ativo = String(req.body.ativo || '') === 'on';
    if (!f.ok) return res.status(400).render('produtos/form', { titulo: 'Editar produto', produto: { ...req.body, id }, erros: f.erros });

    const r = await db.query('UPDATE produtos SET nome=$1, unidade=$2, preco=$3, ativo=$4 WHERE id=$5',
      [f.dados.nome, f.dados.unidade, f.dados.preco, ativo, id]);
    if (!r.rowCount) return res.status(404).render('erro', { titulo: 'Não encontrado', codigo: 404, mensagem: 'Este produto não existe.' });

    await db.query(
      `INSERT INTO estoque (produto_id, quantidade, estoque_minimo) VALUES ($1, 0, $2)
       ON CONFLICT (produto_id) DO UPDATE SET estoque_minimo = EXCLUDED.estoque_minimo`,
      [id, f.dados.estoque_minimo || 0]
    );
    await auditoria.registrar(req, { acao: auditoria.ACOES.ALTERAR, entidade: 'produto', entidadeId: id, detalhe: f.dados.nome });
    res.redirect('/produtos?ok=Produto atualizado com sucesso.');
  } catch (err) { next(err); }
});

module.exports = { estoque: router, produtos };
