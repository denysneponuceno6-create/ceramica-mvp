'use strict';
/**
 * Validacao e normalizacao de entrada. Toda rota que grava passa por aqui.
 * Uso: const f = campos(req.body).texto('nome','Nome'); if (!f.ok) {...}
 */
const RE_EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/i;

class Campos {
  constructor(body = {}) {
    this.body = body || {};
    this.dados = {};
    this.erros = [];
  }
  _raw(nome) {
    const v = this.body[nome];
    return Array.isArray(v) ? v[v.length - 1] : v;
  }
  texto(nome, rotulo, { obrigatorio = true, min = 1, max = 200 } = {}) {
    let v = this._raw(nome);
    v = v === undefined || v === null ? '' : String(v).trim().replace(/[ \t]+/g, ' ');
    if (!v) {
      if (obrigatorio) this.erros.push(`${rotulo} é obrigatório.`);
      this.dados[nome] = null;
      return this;
    }
    if (v.length < min) this.erros.push(`${rotulo} precisa de pelo menos ${min} caracteres.`);
    if (v.length > max) { this.erros.push(`${rotulo} não pode passar de ${max} caracteres.`); v = v.slice(0, max); }
    this.dados[nome] = v;
    return this;
  }
  email(nome, rotulo, { obrigatorio = true } = {}) {
    const v = String(this._raw(nome) || '').trim().toLowerCase();
    if (!v) {
      if (obrigatorio) this.erros.push(`${rotulo} é obrigatório.`);
      this.dados[nome] = null;
      return this;
    }
    if (!RE_EMAIL.test(v)) this.erros.push(`${rotulo} não parece um e-mail válido.`);
    this.dados[nome] = v;
    return this;
  }
  telefone(nome, rotulo, { obrigatorio = true } = {}) {
    const digitos = String(this._raw(nome) || '').replace(/\D/g, '');
    if (!digitos) {
      if (obrigatorio) this.erros.push(`${rotulo} é obrigatório.`);
      this.dados[nome] = null;
      return this;
    }
    if (digitos.length < 10 || digitos.length > 13) this.erros.push(`${rotulo} deve ter de 10 a 13 dígitos, com DDD.`);
    this.dados[nome] = digitos;
    return this;
  }
  inteiro(nome, rotulo, { obrigatorio = true, min = 0, max = 1000000000, padrao = null } = {}) {
    const v = this._raw(nome);
    if (v === undefined || v === null || String(v).trim() === '') {
      if (obrigatorio) this.erros.push(`${rotulo} é obrigatório.`);
      this.dados[nome] = padrao;
      return this;
    }
    const n = Number(String(v).replace(/\./g, '').replace(',', '.'));
    if (!Number.isFinite(n) || !Number.isInteger(n)) {
      this.erros.push(`${rotulo} deve ser um número inteiro.`);
      this.dados[nome] = padrao;
      return this;
    }
    if (n < min) this.erros.push(`${rotulo} não pode ser menor que ${min}.`);
    if (n > max) this.erros.push(`${rotulo} não pode ser maior que ${max}.`);
    this.dados[nome] = n;
    return this;
  }
  decimal(nome, rotulo, { obrigatorio = true, min = 0, max = 99999999, padrao = null } = {}) {
    const v = this._raw(nome);
    if (v === undefined || v === null || String(v).trim() === '') {
      if (obrigatorio) this.erros.push(`${rotulo} é obrigatório.`);
      this.dados[nome] = padrao;
      return this;
    }
    const n = Number(String(v).replace(/\s/g, '').replace(',', '.'));
    if (!Number.isFinite(n)) {
      this.erros.push(`${rotulo} deve ser um número.`);
      this.dados[nome] = padrao;
      return this;
    }
    if (n < min) this.erros.push(`${rotulo} não pode ser menor que ${min}.`);
    if (n > max) this.erros.push(`${rotulo} não pode ser maior que ${max}.`);
    this.dados[nome] = Math.round(n * 100) / 100;
    return this;
  }
  data(nome, rotulo, { obrigatorio = true } = {}) {
    const v = String(this._raw(nome) || '').trim();
    if (!v) {
      if (obrigatorio) this.erros.push(`${rotulo} é obrigatória.`);
      this.dados[nome] = null;
      return this;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) {
      this.erros.push(`${rotulo} deve estar no formato AAAA-MM-DD.`);
      this.dados[nome] = null;
      return this;
    }
    this.dados[nome] = v;
    return this;
  }
  opcao(nome, rotulo, permitidos, { obrigatorio = true, padrao = null } = {}) {
    const v = String(this._raw(nome) || '').trim();
    if (!v) {
      if (obrigatorio) this.erros.push(`${rotulo} é obrigatório.`);
      this.dados[nome] = padrao;
      return this;
    }
    if (!permitidos.includes(v)) {
      this.erros.push(`${rotulo} tem um valor inválido.`);
      this.dados[nome] = padrao;
      return this;
    }
    this.dados[nome] = v;
    return this;
  }
  senha(nome, rotulo, { obrigatorio = true } = {}) {
    const v = String(this._raw(nome) || '');
    if (!v) {
      if (obrigatorio) this.erros.push(`${rotulo} é obrigatória.`);
      this.dados[nome] = null;
      return this;
    }
    if (v.length < 8) this.erros.push(`${rotulo} precisa de pelo menos 8 caracteres.`);
    if (v.length > 200) this.erros.push(`${rotulo} não pode passar de 200 caracteres.`);
    this.dados[nome] = v;
    return this;
  }
  get ok() { return this.erros.length === 0; }
}

const campos = (body) => new Campos(body);

const idParam = (v) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 && n < 2147483647 ? n : null;
};

module.exports = { campos, idParam };
