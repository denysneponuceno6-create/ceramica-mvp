'use strict';
const express = require('express');
const db = require('../db');
const dominio = require('../lib/dominio');
const auditoria = require('../lib/auditoria');
const { campos, idParam } = require('../lib/validate');
const paginacao = require('../lib/paginacao');
const { exigirPermissao } = require('../middleware/auth');

const router = express.Router();

const naoEncontrado = (res, msg = 'Este pedido não existe.') =>
  res.status(404).render('erro', { titulo: 'Não encontrado', codigo: 404, mensagem: msg });

// ------------------------------- lista -------------------------------
router.get('/', exigirPermissao('pedidos:ver'), async (req, res, next) => {
  try {
    const { pagina, limit, offset } = paginacao.ler(req);
    const status = dominio.STATUS_PEDIDO.includes(req.query.status) ? req.query.status : '';
    const busca = String(req.query.busca || '').trim().slice(0, 80);

    const where = [];
    const params = [];
    if (status) { params.push(status); where.push(`p.status = $${params.length}`); }
    if (busca) { params.push(`%${busca}%`); where.push(`c.nome ILIKE $${params.length}`); }
    const filtro = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const total = Number(await db.valor(
      `SELECT COUNT(*)::int FROM pedidos p JOIN clientes c ON c.id = p.cliente_id ${filtro}`, params
    ));

    const pedidos = await db.muitos(
      `SELECT p.id, p.data_pedido, p.data_entrega, p.status, p.valor_total,
              c.nome AS cliente, c.id AS cliente_id,
              (p.data_entrega < CURRENT_DATE AND p.status NOT IN ('entregue','cancelado')) AS atrasado,
              COUNT(i.id)::int AS total_itens
         FROM pedidos p
         JOIN clientes c ON c.id = p.cliente_id
         LEFT JOIN itens_pedido i ON i.pedido_id = p.id
         ${filtro}
         GROUP BY p.id, c.nome, c.id
         ORDER BY p.criado_em DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    res.render('pedidos/lista', {
      titulo: 'Pedidos',
      pedidos, status, busca,
      nav: paginacao.montar(req, pagina, limit, total),
    });
  } catch (err) { next(err); }
});

// ------------------------------- novo --------------------------------
router.get('/novo', exigirPermissao('pedidos:editar'), async (req, res, next) => {
  try {
    const [clientes, produtos] = await Promise.all([
      db.muitos('SELECT id, nome FROM clientes WHERE ativo = TRUE ORDER BY nome'),
      db.muitos(`SELECT p.id, p.nome, p.unidade, p.preco, COALESCE(e.quantidade,0) AS saldo
                   FROM produtos p LEFT JOIN estoque e ON e.produto_id = p.id
                  WHERE p.ativo = TRUE ORDER BY p.nome`),
    ]);
    res.render('pedidos/form', { titulo: 'Novo pedido', clientes, produtos, pedido: {}, erros: [] });
  } catch (err) { next(err); }
});

// ------------------------------ detalhe ------------------------------
router.get('/:id', exigirPermissao('pedidos:ver'), async (req, res, next) => {
  try {
    const id = idParam(req.params.id);
    if (!id) return naoEncontrado(res);

    const pedido = await db.um(
      `SELECT p.*, c.nome AS cliente, c.telefone, c.endereco, u.nome AS criado_por
         FROM pedidos p
         JOIN clientes c ON c.id = p.cliente_id
         LEFT JOIN usuarios u ON u.id = p.usuario_id
        WHERE p.id = $1`,
      [id]
    );
    if (!pedido) return naoEncontrado(res);

    const [itens, entregas] = await Promise.all([
      db.muitos(
        `SELECT i.quantidade, i.preco_unitario, pr.nome, pr.unidade,
                COALESCE(e.quantidade,0) AS saldo_estoque
           FROM itens_pedido i
           JOIN produtos pr ON pr.id = i.produto_id
           LEFT JOIN estoque e ON e.produto_id = pr.id
          WHERE i.pedido_id = $1 ORDER BY i.id`,
        [id]
      ),
      db.muitos(
        `SELECT en.id, en.status, en.data_prevista, en.motorista, v.placa
           FROM entregas en LEFT JOIN veiculos v ON v.id = en.veiculo_id
          WHERE en.pedido_id = $1 ORDER BY en.id DESC`,
        [id]
      ),
    ]);

    res.render('pedidos/detalhe', {
      titulo: `Pedido #${pedido.id}`,
      pedido, itens, entregas,
      transicoes: dominio.transicoesPara(pedido.status, req.sessao.perfil),
    });
  } catch (err) { next(err); }
});

// ------------------------------ criar --------------------------------
router.post('/', exigirPermissao('pedidos:editar'), async (req, res, next) => {
  const recarregar = async (erros, body) => {
    const [clientes, produtos] = await Promise.all([
      db.muitos('SELECT id, nome FROM clientes WHERE ativo = TRUE ORDER BY nome'),
      db.muitos(`SELECT p.id, p.nome, p.unidade, p.preco, COALESCE(e.quantidade,0) AS saldo
                   FROM produtos p LEFT JOIN estoque e ON e.produto_id = p.id
                  WHERE p.ativo = TRUE ORDER BY p.nome`),
    ]);
    return res.status(400).render('pedidos/form', {
      titulo: 'Novo pedido', clientes, produtos, pedido: body, erros,
    });
  };

  try {
    const f = campos(req.body)
      .inteiro('cliente_id', 'Cliente', { min: 1 })
      .data('data_entrega', 'Data de entrega')
      .texto('observacao', 'Observacao', { obrigatorio: false, max: 1000 });

    // Itens: arrays paralelos produto_id[] e quantidade[]
    const produtoIds = [].concat(req.body.produto_id || []);
    const quantidades = [].concat(req.body.quantidade || []);
    const itens = [];
    for (let i = 0; i < produtoIds.length; i++) {
      const pid = idParam(produtoIds[i]);
      const qtd = Number(quantidades[i]);
      if (!pid) continue;
      if (!Number.isInteger(qtd) || qtd <= 0) {
        f.erros.push('A quantidade de cada item deve ser um numero inteiro maior que zero.');
        continue;
      }
      if (qtd > 1000000) { f.erros.push('Quantidade acima do limite permitido.'); continue; }
      const jaTem = itens.find((it) => it.produto_id === pid);
      if (jaTem) jaTem.quantidade += qtd;
      else itens.push({ produto_id: pid, quantidade: qtd });
    }
    if (!itens.length) f.erros.push('Inclua pelo menos um produto no pedido.');
    if (itens.length > 30) f.erros.push('Um pedido aceita no maximo 30 itens.');
    if (!f.ok) return recarregar(f.erros, req.body);

    const cliente = await db.um('SELECT id FROM clientes WHERE id = $1 AND ativo = TRUE', [f.dados.cliente_id]);
    if (!cliente) return recarregar(['Cliente nao encontrado ou inativo.'], req.body);

    const precos = await db.muitos(
      `SELECT id, preco FROM produtos WHERE id = ANY($1::int[]) AND ativo = TRUE`,
      [itens.map((i) => i.produto_id)]
    );
    if (precos.length !== itens.length) return recarregar(['Um dos produtos selecionados nao existe ou esta inativo.'], req.body);
    const mapaPreco = Object.fromEntries(precos.map((p) => [p.id, Number(p.preco)]));

    const pedidoId = await db.transacao(async (c) => {
      const ins = await c.query(
        `INSERT INTO pedidos (cliente_id, data_entrega, status, observacao, usuario_id)
         VALUES ($1, $2, 'novo', $3, $4) RETURNING id`,
        [f.dados.cliente_id, f.dados.data_entrega, f.dados.observacao, req.sessao.uid]
      );
      const id = ins.rows[0].id;
      let total = 0;
      for (const it of itens) {
        const preco = mapaPreco[it.produto_id];
        total += preco * it.quantidade;
        await c.query(
          'INSERT INTO itens_pedido (pedido_id, produto_id, quantidade, preco_unitario) VALUES ($1,$2,$3,$4)',
          [id, it.produto_id, it.quantidade, preco]
        );
      }
      await c.query('UPDATE pedidos SET valor_total = $1 WHERE id = $2', [total.toFixed(2), id]);
      return id;
    });

    await auditoria.registrar(req, {
      acao: auditoria.ACOES.CRIAR, entidade: 'pedido', entidadeId: pedidoId,
      detalhe: `${itens.length} item(ns), entrega em ${f.dados.data_entrega}`,
    });
    res.redirect(`/pedidos/${pedidoId}?ok=Pedido criado com sucesso.`);
  } catch (err) { next(err); }
});

// --------------------------- editar dados ----------------------------
router.post('/:id/editar', exigirPermissao('pedidos:editar'), async (req, res, next) => {
  try {
    const id = idParam(req.params.id);
    if (!id) return naoEncontrado(res);

    const pedido = await db.um('SELECT id, status FROM pedidos WHERE id = $1', [id]);
    if (!pedido) return naoEncontrado(res);
    if (['entregue', 'cancelado'].includes(pedido.status)) {
      return res.redirect(`/pedidos/${id}?err=Pedido finalizado não pode ser alterado.`);
    }

    const f = campos(req.body)
      .data('data_entrega', 'Data de entrega')
      .texto('observacao', 'Observacao', { obrigatorio: false, max: 1000 });
    if (!f.ok) return res.redirect(`/pedidos/${id}?err=${encodeURIComponent(f.erros[0])}`);

    await db.query(
      'UPDATE pedidos SET data_entrega = $1, observacao = $2, atualizado_em = NOW() WHERE id = $3',
      [f.dados.data_entrega, f.dados.observacao, id]
    );
    await auditoria.registrar(req, {
      acao: auditoria.ACOES.ALTERAR, entidade: 'pedido', entidadeId: id,
      detalhe: `Entrega reprogramada para ${f.dados.data_entrega}`,
    });
    res.redirect(`/pedidos/${id}?ok=Alterações salvas com sucesso.`);
  } catch (err) { next(err); }
});

// --------------------------- mudar status ----------------------------
router.post('/:id/status', exigirPermissao('pedidos:status'), async (req, res, next) => {
  try {
    const id = idParam(req.params.id);
    if (!id) return naoEncontrado(res);

    const destino = String(req.body.status || '');
    if (!dominio.STATUS_PEDIDO.includes(destino)) {
      return res.redirect(`/pedidos/${id}?err=Status inválido.`);
    }

    const pedido = await db.um('SELECT id, status, estoque_baixado FROM pedidos WHERE id = $1', [id]);
    if (!pedido) return naoEncontrado(res);

    // A permissao da transicao e verificada no backend, nunca so na tela.
    if (!dominio.podeTransicionar(pedido.status, destino, req.sessao.perfil)) {
      return res.status(403).render('erro', {
        titulo: 'Mudança não permitida',
        codigo: 403,
        mensagem: `Não é possível mudar de "${dominio.ROTULO_STATUS_PEDIDO[pedido.status]}" para "${dominio.ROTULO_STATUS_PEDIDO[destino] || destino}" com o seu perfil.`,
      });
    }

    try {
      await db.transacao(async (c) => {
        // Baixa de estoque ao ficar pronto (uma unica vez por pedido).
        if (destino === dominio.STATUS_QUE_BAIXA_ESTOQUE && !pedido.estoque_baixado) {
          const itens = (await c.query(
            `SELECT i.produto_id, i.quantidade, pr.nome
               FROM itens_pedido i JOIN produtos pr ON pr.id = i.produto_id
              WHERE i.pedido_id = $1`, [id]
          )).rows;

          for (const it of itens) {
            // FOR UPDATE evita corrida entre dois usuarios baixando o mesmo produto.
            const saldo = (await c.query(
              'SELECT quantidade FROM estoque WHERE produto_id = $1 FOR UPDATE', [it.produto_id]
            )).rows[0];
            const atual = saldo ? saldo.quantidade : 0;
            if (atual < it.quantidade) {
              const e = new Error(`Estoque insuficiente de "${it.nome}": disponivel ${atual}, necessario ${it.quantidade}. Registre producao antes.`);
              e.negocio = true;
              throw e;
            }
            await c.query(
              'UPDATE estoque SET quantidade = quantidade - $1, atualizado_em = NOW() WHERE produto_id = $2',
              [it.quantidade, it.produto_id]
            );
            await c.query(
              `INSERT INTO estoque_movimentos (produto_id, tipo, quantidade, motivo, origem, pedido_id, usuario_id)
               VALUES ($1,'saida',$2,$3,'pedido',$4,$5)`,
              [it.produto_id, it.quantidade, `Separacao do pedido #${id}`, id, req.sessao.uid]
            );
          }
          await c.query('UPDATE pedidos SET estoque_baixado = TRUE WHERE id = $1', [id]);
        }

        // Cancelamento devolve o que ja tinha sido baixado.
        if (destino === 'cancelado' && pedido.estoque_baixado) {
          const itens = (await c.query('SELECT produto_id, quantidade FROM itens_pedido WHERE pedido_id = $1', [id])).rows;
          for (const it of itens) {
            await c.query(
              'UPDATE estoque SET quantidade = quantidade + $1, atualizado_em = NOW() WHERE produto_id = $2',
              [it.quantidade, it.produto_id]
            );
            await c.query(
              `INSERT INTO estoque_movimentos (produto_id, tipo, quantidade, motivo, origem, pedido_id, usuario_id)
               VALUES ($1,'entrada',$2,$3,'pedido',$4,$5)`,
              [it.produto_id, it.quantidade, `Devolucao do pedido #${id} cancelado`, id, req.sessao.uid]
            );
          }
          await c.query('UPDATE pedidos SET estoque_baixado = FALSE WHERE id = $1', [id]);
          await c.query(`UPDATE entregas SET status = 'falha', atualizado_em = NOW()
                          WHERE pedido_id = $1 AND status IN ('pendente','em_rota')`, [id]);
        }

        await c.query('UPDATE pedidos SET status = $1, atualizado_em = NOW() WHERE id = $2', [destino, id]);

        // Entregue pelo pedido tambem fecha a entrega vinculada.
        if (destino === 'entregue') {
          await c.query(
            `UPDATE entregas SET status = 'entregue', data_entrega = COALESCE(data_entrega, NOW()), atualizado_em = NOW()
              WHERE pedido_id = $1 AND status <> 'entregue'`, [id]
          );
        }
      });
    } catch (err) {
      if (err.negocio) return res.redirect(`/pedidos/${id}?err=${encodeURIComponent(err.message)}`);
      throw err;
    }

    await auditoria.registrar(req, {
      acao: auditoria.ACOES.STATUS, entidade: 'pedido', entidadeId: id,
      detalhe: `${pedido.status} -> ${destino}`,
    });
    res.redirect(`/pedidos/${id}?ok=Pedido atualizado para ${dominio.ROTULO_STATUS_PEDIDO[destino]}.`);
  } catch (err) { next(err); }
});

module.exports = router;
