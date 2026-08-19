'use strict';
const express = require('express');
const db = require('../db');
const { exigirPermissao } = require('../middleware/auth');

const router = express.Router();

router.get('/', exigirPermissao('dashboard:ver'), async (req, res, next) => {
  try {
    // Um unico round-trip para os contadores de pedidos/entregas/producao.
    const resumo = await db.um(`
      SELECT
        (SELECT COUNT(*)::int FROM pedidos WHERE data_pedido = CURRENT_DATE)                          AS pedidos_hoje,
        (SELECT COUNT(*)::int FROM pedidos WHERE status IN ('novo','confirmado','em_producao'))       AS pedidos_pendentes,
        (SELECT COUNT(*)::int FROM pedidos WHERE status = 'pronto')                                   AS pedidos_prontos,
        (SELECT COALESCE(SUM(valor_total),0) FROM pedidos
           WHERE status <> 'cancelado' AND data_pedido >= date_trunc('month', CURRENT_DATE))          AS faturamento_mes,
        (SELECT COUNT(*)::int FROM entregas WHERE status IN ('pendente','em_rota'))                   AS entregas_abertas,
        (SELECT COUNT(*)::int FROM entregas
           WHERE status IN ('pendente','em_rota') AND data_prevista < CURRENT_DATE)                   AS entregas_atrasadas,
        (SELECT COUNT(*)::int FROM entregas WHERE status = 'entregue'
           AND data_entrega >= CURRENT_DATE)                                                          AS entregas_hoje,
        (SELECT COALESCE(SUM(quantidade),0)::int FROM producao WHERE data = CURRENT_DATE)             AS producao_hoje,
        (SELECT COALESCE(SUM(quantidade),0)::int FROM producao
           WHERE data >= CURRENT_DATE - INTERVAL '7 days')                                            AS producao_semana,
        (SELECT COALESCE(SUM(perdas),0)::int FROM producao
           WHERE data >= CURRENT_DATE - INTERVAL '7 days')                                            AS perdas_semana,
        (SELECT COALESCE(SUM(quantidade),0)::int FROM estoque)                                        AS estoque_total,
        (SELECT COUNT(*)::int FROM estoque WHERE quantidade <= estoque_minimo)                        AS estoque_alerta,
        (SELECT COUNT(*)::int FROM veiculos WHERE status = 'disponivel')                              AS veiculos_disponiveis,
        (SELECT COUNT(*)::int FROM veiculos WHERE status <> 'inativo')                                AS veiculos_ativos
    `);

    // Distribuicao por etapa do fluxo (esteira do dashboard).
    const porStatus = await db.muitos(`
      SELECT status, COUNT(*)::int AS total
        FROM pedidos
       WHERE status <> 'cancelado'
       GROUP BY status
    `);
    const mapaStatus = Object.fromEntries(porStatus.map((r) => [r.status, r.total]));

    const estoque = await db.muitos(`
      SELECT p.nome, p.unidade, e.quantidade, e.estoque_minimo
        FROM estoque e
        JOIN produtos p ON p.id = e.produto_id
       WHERE p.ativo = TRUE
       ORDER BY (e.quantidade <= e.estoque_minimo) DESC, e.quantidade ASC
       LIMIT 6
    `);

    const proximasEntregas = await db.muitos(`
      SELECT en.id, en.data_prevista, en.status, en.motorista,
             c.nome AS cliente, p.id AS pedido_id,
             (en.data_prevista < CURRENT_DATE) AS atrasada
        FROM entregas en
        JOIN pedidos  p ON p.id = en.pedido_id
        JOIN clientes c ON c.id = p.cliente_id
       WHERE en.status IN ('pendente','em_rota')
       ORDER BY en.data_prevista ASC
       LIMIT 6
    `);

    const pedidosRecentes = await db.muitos(`
      SELECT p.id, p.status, p.data_entrega, p.valor_total, c.nome AS cliente,
             (p.data_entrega < CURRENT_DATE AND p.status NOT IN ('entregue','cancelado')) AS atrasado
        FROM pedidos p
        JOIN clientes c ON c.id = p.cliente_id
       ORDER BY p.criado_em DESC
       LIMIT 6
    `);

    // Serie dos ultimos 7 dias para o grafico de producao do painel.
    // Consulta apenas de leitura: nao altera nenhuma regra existente.
    const producaoSerie = await db.muitos(`
      SELECT dia::date AS data,
             COALESCE(p.total, 0)::int  AS quantidade,
             COALESCE(p.perdido, 0)::int AS perdas
        FROM generate_series(CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE, INTERVAL '1 day') AS dia
        LEFT JOIN (
              SELECT data, SUM(quantidade) AS total, SUM(perdas) AS perdido
                FROM producao
               WHERE data >= CURRENT_DATE - INTERVAL '6 days'
               GROUP BY data
             ) p ON p.data = dia::date
       ORDER BY dia ASC
    `);

    res.render('dashboard', {
      titulo: 'Painel',
      resumo,
      mapaStatus,
      estoque,
      proximasEntregas,
      pedidosRecentes,
      producaoSerie,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
