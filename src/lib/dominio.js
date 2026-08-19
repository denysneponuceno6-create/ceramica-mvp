'use strict';
/**
 * Regras de dominio centralizadas: perfis, permissoes, status e transicoes.
 * Toda checagem de permissao do backend passa por aqui (nunca so na tela).
 */

// ---------- Perfis e permissoes ----------
const PERFIS = ['admin', 'vendas', 'producao', 'logistica'];

const ROTULO_PERFIL = {
  admin: 'Administrador',
  vendas: 'Vendas',
  producao: 'Produção',
  logistica: 'Logística',
};

// '*' = acesso total. Permissao no formato "recurso:acao".
const PERMISSOES = {
  admin: ['*'],
  vendas: [
    'dashboard:ver',
    'clientes:ver', 'clientes:editar',
    'produtos:ver',
    'pedidos:ver', 'pedidos:editar', 'pedidos:status',
    'estoque:ver',
    'producao:ver',
    'entregas:ver',
    'frota:ver',
  ],
  producao: [
    'dashboard:ver',
    'clientes:ver',
    'produtos:ver', 'produtos:editar',
    'pedidos:ver', 'pedidos:status',
    'estoque:ver', 'estoque:editar',
    'producao:ver', 'producao:editar',
    'entregas:ver',
  ],
  logistica: [
    'dashboard:ver',
    'clientes:ver',
    'produtos:ver',
    'pedidos:ver', 'pedidos:status',
    'estoque:ver',
    'entregas:ver', 'entregas:editar',
    'frota:ver', 'frota:editar',
  ],
};

function pode(perfil, permissao) {
  const lista = PERMISSOES[perfil];
  if (!lista) return false;
  return lista.includes('*') || lista.includes(permissao);
}

// ---------- Status de pedido ----------
const STATUS_PEDIDO = ['novo', 'confirmado', 'em_producao', 'pronto', 'em_rota', 'entregue', 'cancelado'];

const ROTULO_STATUS_PEDIDO = {
  novo: 'Novo',
  confirmado: 'Confirmado',
  em_producao: 'Em produção',
  pronto: 'Pronto',
  em_rota: 'Em rota',
  entregue: 'Entregue',
  cancelado: 'Cancelado',
};

// Etapas do fluxo principal exibidas na esteira do pedido.
const ESTEIRA = ['novo', 'confirmado', 'em_producao', 'pronto', 'em_rota', 'entregue'];

// Transicoes permitidas e quem pode executar cada uma.
const TRANSICOES = {
  novo:        { confirmado: ['admin', 'vendas'], cancelado: ['admin', 'vendas'] },
  confirmado:  { em_producao: ['admin', 'producao'], pronto: ['admin', 'producao'], cancelado: ['admin', 'vendas'] },
  em_producao: { pronto: ['admin', 'producao'], cancelado: ['admin', 'vendas'] },
  pronto:      { em_rota: ['admin', 'logistica'], cancelado: ['admin', 'vendas'] },
  em_rota:     { entregue: ['admin', 'logistica'], pronto: ['admin', 'logistica'] },
  entregue:    {},
  cancelado:   {},
};

function transicoesPara(statusAtual, perfil) {
  const destinos = TRANSICOES[statusAtual] || {};
  return Object.keys(destinos).filter((d) => destinos[d].includes(perfil));
}

function podeTransicionar(statusAtual, destino, perfil) {
  const destinos = TRANSICOES[statusAtual] || {};
  return Array.isArray(destinos[destino]) && destinos[destino].includes(perfil);
}

// A baixa de estoque acontece quando o pedido fica pronto para expedicao.
const STATUS_QUE_BAIXA_ESTOQUE = 'pronto';

// ---------- Status de entrega ----------
const STATUS_ENTREGA = ['pendente', 'em_rota', 'entregue', 'falha'];

const ROTULO_STATUS_ENTREGA = {
  pendente: 'Pendente',
  em_rota: 'Em rota',
  entregue: 'Entregue',
  falha: 'Problema',
};

// ---------- Status de veiculo ----------
const STATUS_VEICULO = ['disponivel', 'em_rota', 'manutencao', 'inativo'];

const ROTULO_STATUS_VEICULO = {
  disponivel: 'Disponível',
  em_rota: 'Em rota',
  manutencao: 'Manutenção',
  inativo: 'Inativo',
};

const TIPOS_MOVIMENTO = ['entrada', 'saida', 'ajuste'];

const ROTULO_MOVIMENTO = {
  entrada: 'Entrada',
  saida: 'Saída',
  ajuste: 'Ajuste',
};

module.exports = {
  PERFIS, ROTULO_PERFIL, PERMISSOES, pode,
  STATUS_PEDIDO, ROTULO_STATUS_PEDIDO, ESTEIRA, TRANSICOES, transicoesPara, podeTransicionar,
  STATUS_QUE_BAIXA_ESTOQUE,
  STATUS_ENTREGA, ROTULO_STATUS_ENTREGA,
  STATUS_VEICULO, ROTULO_STATUS_VEICULO,
  TIPOS_MOVIMENTO, ROTULO_MOVIMENTO,
};
