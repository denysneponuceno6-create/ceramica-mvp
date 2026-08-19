'use strict';
/**
 * Registro de auditoria. Nunca derruba a requisicao: se o log falhar,
 * apenas avisa no console. Grava usuario, acao, entidade, detalhe, IP e data/hora.
 */
const db = require('../db');

const ACOES = {
  LOGIN: 'login',
  LOGIN_FALHA: 'login_falha',
  LOGOUT: 'logout',
  CRIAR: 'criar',
  ALTERAR: 'alterar',
  STATUS: 'alterar_status',
  EXCLUIR: 'excluir',
  ESTOQUE: 'movimento_estoque',
};

async function registrar(req, { acao, entidade = null, entidadeId = null, detalhe = null, usuario = null }) {
  try {
    const u = usuario || res_usuario(req);
    const ip = String(req.ip || '').replace('::ffff:', '').slice(0, 64);
    await db.query(
      `INSERT INTO logs (usuario_id, usuario_nome, acao, entidade, entidade_id, detalhe, ip)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        u?.id || null,
        (u?.nome || 'anonimo').slice(0, 120),
        String(acao).slice(0, 60),
        entidade ? String(entidade).slice(0, 40) : null,
        Number.isInteger(entidadeId) ? entidadeId : null,
        detalhe ? String(detalhe).slice(0, 500) : null,
        ip,
      ]
    );
  } catch (err) {
    console.error('[auditoria] nao foi possivel gravar o log:', err.message);
  }
}

function res_usuario(req) {
  if (!req.sessao) return null;
  return { id: req.sessao.uid, nome: req.sessao.nome };
}

module.exports = { registrar, ACOES };
