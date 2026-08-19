'use strict';
const config = require('../config');

/** Le ?pagina= e devolve limit/offset seguros. */
function ler(req, tamanho = config.pageSize) {
  const n = Number(req.query.pagina);
  const pagina = Number.isInteger(n) && n > 0 && n < 100000 ? n : 1;
  return { pagina, limit: tamanho, offset: (pagina - 1) * tamanho };
}

/** Monta os dados de navegacao preservando os filtros da URL. */
function montar(req, pagina, limit, total) {
  const totalPaginas = Math.max(1, Math.ceil(total / limit));
  const base = { ...req.query };
  delete base.pagina;
  const qs = new URLSearchParams(base).toString();
  const url = (p) => `${req.path}?${qs ? qs + '&' : ''}pagina=${p}`;
  return {
    pagina, totalPaginas, total,
    temAnterior: pagina > 1,
    temProxima: pagina < totalPaginas,
    urlAnterior: url(pagina - 1),
    urlProxima: url(pagina + 1),
  };
}

module.exports = { ler, montar };
