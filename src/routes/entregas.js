'use strict';
const express = require('express');
const db = require('../db');
const dominio = require('../lib/dominio');
const auditoria = require('../lib/auditoria');
const { campos, idParam } = require('../lib/validate');
const paginacao = require('../lib/paginacao');
const { exigirPermissao } = require('../middleware/auth');

const router = express.Router();

const naoEncontrada = (res, msg = 'Esta entrega não existe.') =>
  res.status(404).render('erro', { titulo: 'Não encontrado', codigo: 404, mensagem: msg });

// ------------------------------- lista -------------------------------
router.get('/', exigirPermissao('entregas:ver'), async (req, res, next) => {
  try {
    const { pagina, limit, offset } = paginacao.ler(req);
    const status = dominio.STATUS_ENTREGA.includes(req.query.status) ? req.query.status : '';
    const params = [];
    let filtro = '';
    if (status) { params.push(status); filtro = `WHERE en.status = $${params.length}`; }

    const total = Number(await db.valor(`SELECT COUNT(*)::int FROM entregas en ${filtro}`, params));
    const entregas = await db.muitos(
      `SELECT en.id, en.status, en.data_prevista, en.data_saida, en.data_entrega,
              en.motorista, en.endereco, en.pedido_id,
              c.nome AS cliente, v.placa, v.modelo,
              (en.data_prevista < CURRENT_DATE AND en.status IN ('pendente','em_rota')) AS atrasada,
              (SELECT COUNT(*)::int FROM ocorrencias o WHERE o.entrega_id = en.id) AS ocorrencias
         FROM entregas en
         JOIN pedidos  p ON p.id = en.pedido_id
         JOIN clientes c ON c.id = p.cliente_id
         LEFT JOIN veiculos v ON v.id = en.veiculo_id
         ${filtro}
        ORDER BY (en.status IN ('pendente','em_rota')) DESC, en.data_prevista ASC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    res.render('entregas/lista', {
      titulo: 'Entregas', entregas, status,
      nav: paginacao.montar(req, pagina, limit, total),
    });
  } catch (err) { next(err); }
});

// -------------------------- nova (a partir do pedido) -----------------
router.get('/nova', exigirPermissao('entregas:editar'), async (req, res, next) => {
  try {
    const [pedidos, veiculos] = await Promise.all([
      db.muitos(`
        SELECT p.id, p.data_entrega, c.nome AS cliente, c.endereco
          FROM pedidos p JOIN clientes c ON c.id = p.cliente_id
         WHERE p.status IN ('pronto','em_rota')
           AND NOT EXISTS (SELECT 1 FROM entregas e WHERE e.pedido_id = p.id AND e.status <> 'falha')
         ORDER BY p.data_entrega ASC LIMIT 100
      `),
      db.muitos(`SELECT id, placa, modelo, capacidade FROM veiculos WHERE status IN ('disponivel','em_rota') ORDER BY placa`),
    ]);
    res.render('entregas/form', {
      titulo: 'Nova entrega', pedidos, veiculos,
      entrega: { pedido_id: req.query.pedido || '' }, erros: [],
    });
  } catch (err) { next(err); }
});

// ------------------------------ detalhe ------------------------------
router.get('/:id', exigirPermissao('entregas:ver'), async (req, res, next) => {
  try {
    const id = idParam(req.params.id);
    if (!id) return naoEncontrada(res);

    const entrega = await db.um(
      `SELECT en.*, p.status AS status_pedido, p.valor_total,
              c.nome AS cliente, c.telefone, v.placa, v.modelo
         FROM entregas en
         JOIN pedidos  p ON p.id = en.pedido_id
         JOIN clientes c ON c.id = p.cliente_id
         LEFT JOIN veiculos v ON v.id = en.veiculo_id
        WHERE en.id = $1`,
      [id]
    );
    if (!entrega) return naoEncontrada(res);

    const [ocorrencias, veiculos] = await Promise.all([
      db.muitos(
        `SELECT o.id, o.descricao, o.criado_em, u.nome AS usuario
           FROM ocorrencias o LEFT JOIN usuarios u ON u.id = o.usuario_id
          WHERE o.entrega_id = $1 ORDER BY o.criado_em DESC`,
        [id]
      ),
      db.muitos(`SELECT id, placa, modelo FROM veiculos WHERE status <> 'inativo' ORDER BY placa`),
    ]);

    res.render('entregas/detalhe', { titulo: `Entrega #${entrega.id}`, entrega, ocorrencias, veiculos });
  } catch (err) { next(err); }
});

// ------------------------------- criar -------------------------------
router.post('/', exigirPermissao('entregas:editar'), async (req, res, next) => {
  const recarregar = async (erros, body) => {
    const [pedidos, veiculos] = await Promise.all([
      db.muitos(`
        SELECT p.id, p.data_entrega, c.nome AS cliente, c.endereco
          FROM pedidos p JOIN clientes c ON c.id = p.cliente_id
         WHERE p.status IN ('pronto','em_rota')
           AND NOT EXISTS (SELECT 1 FROM entregas e WHERE e.pedido_id = p.id AND e.status <> 'falha')
         ORDER BY p.data_entrega ASC LIMIT 100`),
      db.muitos(`SELECT id, placa, modelo, capacidade FROM veiculos WHERE status IN ('disponivel','em_rota') ORDER BY placa`),
    ]);
    return res.status(400).render('entregas/form', { titulo: 'Nova entrega', pedidos, veiculos, entrega: body, erros });
  };

  try {
    const f = campos(req.body)
      .inteiro('pedido_id', 'Pedido', { min: 1 })
      .inteiro('veiculo_id', 'Veiculo', { obrigatorio: false, min: 1, padrao: null })
      .texto('motorista', 'Motorista', { obrigatorio: false, max: 120 })
      .texto('endereco', 'Endereco de entrega', { min: 5, max: 255 })
      .data('data_prevista', 'Data prevista');

    if (!f.ok) return recarregar(f.erros, req.body);

    const pedido = await db.um('SELECT id, status FROM pedidos WHERE id = $1', [f.dados.pedido_id]);
    if (!pedido) return recarregar(['Pedido não encontrado.'], req.body);
    if (!['pronto', 'em_rota'].includes(pedido.status)) {
      return recarregar(['Só é possível criar entrega para pedidos com status Pronto ou Em rota.'], req.body);
    }
    const jaTem = await db.um(`SELECT id FROM entregas WHERE pedido_id = $1 AND status <> 'falha'`, [pedido.id]);
    if (jaTem) return recarregar([`O pedido #${pedido.id} já possui a entrega #${jaTem.id}.`], req.body);

    if (f.dados.veiculo_id) {
      const v = await db.um(`SELECT id FROM veiculos WHERE id = $1 AND status <> 'inativo'`, [f.dados.veiculo_id]);
      if (!v) return recarregar(['Veículo não encontrado ou inativo.'], req.body);
    }

    const nova = await db.um(
      `INSERT INTO entregas (pedido_id, veiculo_id, motorista, endereco, data_prevista, status)
       VALUES ($1,$2,$3,$4,$5,'pendente') RETURNING id`,
      [f.dados.pedido_id, f.dados.veiculo_id, f.dados.motorista, f.dados.endereco, f.dados.data_prevista]
    );

    await auditoria.registrar(req, {
      acao: auditoria.ACOES.CRIAR, entidade: 'entrega', entidadeId: nova.id,
      detalhe: `Pedido #${f.dados.pedido_id}, prevista para ${f.dados.data_prevista}`,
    });
    res.redirect(`/entregas/${nova.id}?ok=Entrega criada com sucesso.`);
  } catch (err) { next(err); }
});

// -------------------------- atribuir veiculo -------------------------
router.post('/:id/atribuir', exigirPermissao('entregas:editar'), async (req, res, next) => {
  try {
    const id = idParam(req.params.id);
    if (!id) return naoEncontrada(res);

    const f = campos(req.body)
      .inteiro('veiculo_id', 'Veiculo', { obrigatorio: false, min: 1, padrao: null })
      .texto('motorista', 'Motorista', { obrigatorio: false, max: 120 })
      .data('data_prevista', 'Data prevista');
    if (!f.ok) return res.redirect(`/entregas/${id}?err=${encodeURIComponent(f.erros[0])}`);

    const r = await db.query(
      'UPDATE entregas SET veiculo_id=$1, motorista=$2, data_prevista=$3, atualizado_em=NOW() WHERE id=$4',
      [f.dados.veiculo_id, f.dados.motorista, f.dados.data_prevista, id]
    );
    if (!r.rowCount) return naoEncontrada(res);

    await auditoria.registrar(req, {
      acao: auditoria.ACOES.ALTERAR, entidade: 'entrega', entidadeId: id,
      detalhe: `Veiculo/motorista atualizados (motorista: ${f.dados.motorista || 'nao definido'})`,
    });
    res.redirect(`/entregas/${id}?ok=Dados da entrega salvos com sucesso.`);
  } catch (err) { next(err); }
});

// --------------------------- mudar status ----------------------------
router.post('/:id/status', exigirPermissao('entregas:editar'), async (req, res, next) => {
  try {
    const id = idParam(req.params.id);
    if (!id) return naoEncontrada(res);

    const destino = String(req.body.status || '');
    if (!dominio.STATUS_ENTREGA.includes(destino)) return res.redirect(`/entregas/${id}?err=Status inválido.`);

    const entrega = await db.um('SELECT id, status, pedido_id, veiculo_id FROM entregas WHERE id = $1', [id]);
    if (!entrega) return naoEncontrada(res);
    if (entrega.status === destino) return res.redirect(`/entregas/${id}?err=A entrega já está nesse status.`);
    if (entrega.status === 'entregue') return res.redirect(`/entregas/${id}?err=Entrega já confirmada não pode mudar de status.`);
    if (destino === 'em_rota' && !entrega.veiculo_id) {
      return res.redirect(`/entregas/${id}?err=Defina o veículo antes de iniciar a rota.`);
    }

    // Entrega e pedido caminham juntos: atualizacao em transacao unica.
    await db.transacao(async (c) => {
      await c.query(
        // O cast e obrigatorio: sem ele o Postgres tenta deduzir dois tipos
        // diferentes para o mesmo $1 (valor da coluna e operando do CASE).
        `UPDATE entregas SET status = $1::varchar, atualizado_em = NOW(),
                data_saida   = CASE WHEN $1::varchar = 'em_rota'  THEN COALESCE(data_saida, NOW())   ELSE data_saida   END,
                data_entrega = CASE WHEN $1::varchar = 'entregue' THEN COALESCE(data_entrega, NOW()) ELSE data_entrega END
          WHERE id = $2`,
        [destino, id]
      );
      if (destino === 'em_rota') {
        await c.query(`UPDATE pedidos SET status = 'em_rota', atualizado_em = NOW()
                        WHERE id = $1 AND status = 'pronto'`, [entrega.pedido_id]);
        if (entrega.veiculo_id) {
          await c.query(`UPDATE veiculos SET status = 'em_rota' WHERE id = $1 AND status = 'disponivel'`, [entrega.veiculo_id]);
        }
      }
      if (destino === 'entregue') {
        await c.query(`UPDATE pedidos SET status = 'entregue', atualizado_em = NOW()
                        WHERE id = $1 AND status IN ('pronto','em_rota')`, [entrega.pedido_id]);
        if (entrega.veiculo_id) {
          const restantes = (await c.query(
            `SELECT COUNT(*)::int AS n FROM entregas WHERE veiculo_id = $1 AND status = 'em_rota' AND id <> $2`,
            [entrega.veiculo_id, id]
          )).rows[0].n;
          if (restantes === 0) {
            await c.query(`UPDATE veiculos SET status = 'disponivel' WHERE id = $1 AND status = 'em_rota'`, [entrega.veiculo_id]);
          }
        }
      }
    });

    await auditoria.registrar(req, {
      acao: auditoria.ACOES.STATUS, entidade: 'entrega', entidadeId: id,
      detalhe: `${entrega.status} -> ${destino} (pedido #${entrega.pedido_id})`,
    });
    // Mensagem escrita para o momento: quem confirma uma entrega no celular
    // precisa de uma frase clara, nao do nome tecnico do status.
    const CONFIRMACAO = {
      em_rota: 'Rota iniciada. A entrega esta a caminho do cliente.',
      entregue: 'Entrega confirmada com sucesso.',
      pendente: 'Entrega marcada como pendente.',
      falha: 'Problema registrado nesta entrega.',
    };
    res.redirect(`/entregas/${id}?ok=${encodeURIComponent(CONFIRMACAO[destino] || 'Entrega atualizada.')}`);
  } catch (err) { next(err); }
});

// ---------------------------- ocorrencias ----------------------------
router.post('/:id/ocorrencia', exigirPermissao('entregas:editar'), async (req, res, next) => {
  try {
    const id = idParam(req.params.id);
    if (!id) return naoEncontrada(res);

    const f = campos(req.body).texto('descricao', 'Descricao da ocorrencia', { min: 5, max: 500 });
    if (!f.ok) return res.redirect(`/entregas/${id}?err=${encodeURIComponent(f.erros[0])}`);

    const entrega = await db.um('SELECT id FROM entregas WHERE id = $1', [id]);
    if (!entrega) return naoEncontrada(res);

    await db.query('INSERT INTO ocorrencias (entrega_id, descricao, usuario_id) VALUES ($1,$2,$3)',
      [id, f.dados.descricao, req.sessao.uid]);
    await auditoria.registrar(req, {
      acao: auditoria.ACOES.CRIAR, entidade: 'ocorrencia', entidadeId: id,
      detalhe: f.dados.descricao.slice(0, 120),
    });
    res.redirect(`/entregas/${id}?ok=Ocorrência registrada com sucesso.`);
  } catch (err) { next(err); }
});

// ================================ frota ===============================
const frota = express.Router();

frota.get('/', exigirPermissao('frota:ver'), async (req, res, next) => {
  try {
    const veiculos = await db.muitos(`
      SELECT v.*,
             (SELECT COUNT(*)::int FROM entregas e WHERE e.veiculo_id = v.id AND e.status = 'em_rota') AS entregas_rota,
             (SELECT COUNT(*)::int FROM entregas e WHERE e.veiculo_id = v.id AND e.status = 'entregue') AS entregas_feitas
        FROM veiculos v ORDER BY v.placa
    `);
    res.render('frota/lista', { titulo: 'Frota de veículos', veiculos, veiculo: {}, erros: [] });
  } catch (err) { next(err); }
});

function validarVeiculo(body) {
  const f = campos(body)
    .texto('placa', 'Placa', { min: 7, max: 8 })
    .texto('modelo', 'Modelo', { min: 3, max: 120 })
    .inteiro('capacidade', 'Capacidade', { min: 0, max: 200000 })
    .opcao('status', 'Status', dominio.STATUS_VEICULO);
  if (f.dados.placa) {
    const p = f.dados.placa.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(p)) {
      f.erros.push('Placa invalida. Use o formato ABC1D23 ou ABC1234.');
    }
    f.dados.placa = p;
  }
  return f;
}

frota.post('/', exigirPermissao('frota:editar'), async (req, res, next) => {
  try {
    const f = validarVeiculo(req.body);
    if (!f.ok) {
      const veiculos = await db.muitos('SELECT v.*, 0 AS entregas_rota, 0 AS entregas_feitas FROM veiculos v ORDER BY v.placa');
      return res.status(400).render('frota/lista', { titulo: 'Frota de veículos', veiculos, veiculo: req.body, erros: f.erros });
    }
    const existe = await db.um('SELECT id FROM veiculos WHERE UPPER(placa) = $1', [f.dados.placa]);
    if (existe) {
      const veiculos = await db.muitos('SELECT v.*, 0 AS entregas_rota, 0 AS entregas_feitas FROM veiculos v ORDER BY v.placa');
      return res.status(400).render('frota/lista', {
        titulo: 'Frota de veículos', veiculos, veiculo: req.body, erros: ['Já existe um veículo com essa placa.'],
      });
    }
    const novo = await db.um(
      'INSERT INTO veiculos (placa, modelo, capacidade, status) VALUES ($1,$2,$3,$4) RETURNING id',
      [f.dados.placa, f.dados.modelo, f.dados.capacidade, f.dados.status]
    );
    await auditoria.registrar(req, {
      acao: auditoria.ACOES.CRIAR, entidade: 'veiculo', entidadeId: novo.id, detalhe: `${f.dados.placa} - ${f.dados.modelo}`,
    });
    res.redirect('/frota?ok=Veículo cadastrado com sucesso.');
  } catch (err) { next(err); }
});

frota.post('/:id/status', exigirPermissao('frota:editar'), async (req, res, next) => {
  try {
    const id = idParam(req.params.id);
    if (!id) return res.status(404).render('erro', { titulo: 'Não encontrado', codigo: 404, mensagem: 'Este veículo não existe.' });

    const f = campos(req.body).opcao('status', 'Status', dominio.STATUS_VEICULO);
    if (!f.ok) return res.redirect(`/frota?err=${encodeURIComponent(f.erros[0])}`);

    const r = await db.query('UPDATE veiculos SET status = $1 WHERE id = $2', [f.dados.status, id]);
    if (!r.rowCount) return res.status(404).render('erro', { titulo: 'Não encontrado', codigo: 404, mensagem: 'Este veículo não existe.' });

    await auditoria.registrar(req, {
      acao: auditoria.ACOES.STATUS, entidade: 'veiculo', entidadeId: id, detalhe: `Status: ${f.dados.status}`,
    });
    res.redirect('/frota?ok=Status do veículo atualizado.');
  } catch (err) { next(err); }
});

module.exports = { entregas: router, frota };
