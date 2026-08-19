'use strict';
/** Helpers de formatacao usados nas views (pt-BR, sem dependencias). */

const NUM = new Intl.NumberFormat('pt-BR');
const MOEDA = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

function numero(v) {
  const n = Number(v);
  return Number.isFinite(n) ? NUM.format(n) : '0';
}

function dinheiro(v) {
  const n = Number(v);
  return Number.isFinite(n) ? MOEDA.format(n) : MOEDA.format(0);
}

/** Data (coluna DATE) -> dd/mm/aaaa, sem deslocamento de fuso. */
function data(v) {
  if (!v) return '-';
  const s = v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);
  const [a, m, d] = s.split('-');
  return d ? `${d}/${m}/${a}` : '-';
}

/** Timestamp -> dd/mm/aaaa hh:mm no fuso de Brasilia. */
function dataHora(v) {
  if (!v) return '-';
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/** Valor para <input type="date">. */
function dataInput(v) {
  if (!v) return '';
  return v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);
}

function telefone(v) {
  const d = String(v || '').replace(/\D/g, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return d || '-';
}

/** Link "tel:" para ligar com um toque no celular. Null se nao houver numero. */
function ligar(v) {
  const d = String(v || '').replace(/\D/g, '');
  if (d.length < 10) return null;
  return `tel:+${d.startsWith('55') ? d : `55${d}`}`;
}

/**
 * Link do WhatsApp com a mensagem ja escrita (wa.me).
 * Abre o aplicativo no celular ou o WhatsApp Web no computador.
 * Nao e uma integracao de servidor: e o proprio funcionario quem envia,
 * do numero dele, e por isso funciona sem cadastro nem chave de API.
 */
function whatsapp(v, texto) {
  const d = String(v || '').replace(/\D/g, '');
  if (d.length < 10) return null;
  const numero = d.startsWith('55') ? d : `55${d}`;
  const msg = String(texto || '').trim();
  return `https://wa.me/${numero}${msg ? `?text=${encodeURIComponent(msg)}` : ''}`;
}

const hoje = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

module.exports = { numero, dinheiro, data, dataHora, dataInput, telefone, ligar, whatsapp, hoje };
