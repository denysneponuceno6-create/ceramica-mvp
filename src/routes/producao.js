'use strict';
const express = require('express');
const db = require('../db');
const auditoria = require('../lib/auditoria');
const { campos } = require('../lib/validate');
const paginacao = require('../lib/paginacao');
const formato = require('../lib/formato');
const { exigirPermissao } = require('../middleware/auth');

const router = express.Router();

router.get('/', exigirPermissao('producao:ver'), async (req, res, next) => {
  try {
    const { pagina, limit, offset } = paginacao.ler(req);
    const total = Number(await db.valor('SELECT COUNT(*)::int FROM producao'));

    const [registros, produtos, resumo] = await Promise.all([
      db.muitos(
        `SELECT pr.id, pr.quantidade, pr.perdas, pr.lote, pr.data, pr.observacao,
                p.nome AS produto, p.unidade, u.nome AS usuario
           FROM producao pr
           JOIN produtos p ON p.id = pr.produto_id
           LEFT JOIN usuarios u ON u.id = pr.usuario_id
          ORDER BY pr.data DESC, pr.id DESC
          LIMIT $1 OFFSET $2`,
        [limit, offset]
      ),
      db.muitos('SELECT id, nome, unidade FROM produtos WHERE ativo = TRUE ORDER BY nome'),
      db.um(`
        SELECT COALESCE(SUM(quantidade) FILTER (WHERE data = CURRENT_DATE), 0)::int AS hoje,
               COALESCE(SUM(quantidade) FILTER (WHERE data >= CURRENT_DATE - INTERVAL '7 days'), 0)::int AS semana,
               COALESCE(SUM(perdas)     FILTER (WHERE data >= CURRENT_DATE - INTERVAL '7 days'), 0)::int AS perdas
          FROM producao
      `),
    ]);

    res.render('producao/lista', {
      titulo: 'Producao',
      registros, produtos, resumo,
      hoje: formato.hoje(),
      nav: paginacao.montar(req, pagina, limit, total),
    });
  } catch (err) { next(err); }
});

router.post('/', exigirPermissao('producao:editar'), async (req, res, next) => {
  try {
    const f = campos(req.body)
      .inteiro('produto_id', 'Produto', { min: 1 })
      .inteiro('quantidade', 'Quantidade produzida', { min: 1, max: 10000000 })
      .inteiro('perdas', 'Perdas', { obrigatorio: false, min: 0, max: 10000000, padrao: 0 })
      .texto('lote', 'Lote', { min: 1, max: 40 })
      .data('data', 'Data')
      .texto('observacao', 'Observacao', { obrigatorio: false, max: 255 });

    if (!f.ok) return res.redirect(`/producao?err=${encodeURIComponent(f.erros[0])}`);

    const produto = await db.um('SELECT id, nome FROM produtos WHERE id = $1 AND ativo = TRUE', [f.dados.produto_id]);
    if (!produto) return res.redirect('/producao?err=Produto não encontrado ou inativo.');

    // Producao e estoque entram juntos: ou grava os dois, ou nenhum.
    const id = await db.transacao(async (c) => {
      const r = await c.query(
        `INSERT INTO producao (produto_id, quantidade, perdas, lote, data, observacao, usuario_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [f.dados.produto_id, f.dados.quantidade, f.dados.perdas || 0, f.dados.lote,
         f.dados.data, f.dados.observacao, req.sessao.uid]
      );
      await c.query(
        'INSERT INTO estoque (produto_id, quantidade) VALUES ($1, 0) ON CONFLICT (produto_id) DO NOTHING',
        [f.dados.produto_id]
      );
      await c.query(
        'UPDATE estoque SET quantidade = quantidade + $1, atualizado_em = NOW() WHERE produto_id = $2',
        [f.dados.quantidade, f.dados.produto_id]
      );
      await c.query(
        `INSERT INTO estoque_movimentos (produto_id, tipo, quantidade, motivo, origem, usuario_id)
         VALUES ($1,'entrada',$2,$3,'producao',$4)`,
        [f.dados.produto_id, f.dados.quantidade, `Producao lote ${f.dados.lote}`, req.sessao.uid]
      );
      return r.rows[0].id;
    });

    await auditoria.registrar(req, {
      acao: auditoria.ACOES.CRIAR, entidade: 'producao', entidadeId: id,
      detalhe: `${f.dados.quantidade} de ${produto.nome} (lote ${f.dados.lote})`,
    });
    res.redirect('/producao?ok=Produção registrada e estoque atualizado.');
  } catch (err) { next(err); }
});

module.exports = router;
