'use strict';
/**
 * Dados ficticios para demonstracao. Nenhum dado real e usado.
 *
 * Regras de seguranca:
 *  - So popula se o banco estiver vazio (a menos que rode com --reset).
 *  - Nao ha rota HTTP de seed: e executado por comando ou no boot.
 *  - Senhas ficticias vem de variavel de ambiente ou sao geradas aleatoriamente
 *    e impressas uma unica vez no log. Nenhuma senha fixa no codigo.
 *
 * Uso: npm run seed        (popula se estiver vazio)
 *      npm run reset       (apaga tudo e popula de novo)
 */
const crypto = require('crypto');
const db = require('./index');
const { migrar } = require('./migrate');
const senhaUtil = require('../lib/password');
const config = require('../config');

const DEMO_SENHA_PADRAO = process.env.DEMO_PASSWORD || null;

const CLIENTES = [
  ['Construtora Barro Novo LTDA', '63988110022', 'Av. Palmas Brasil, 1500, Galpao 3', 'Palmas'],
  ['Deposito Sao Jorge Materiais', '63991220033', 'Rua 12, Quadra 4, Lote 9', 'Palmas'],
  ['Empreiteira Vale do Rio', '63992330044', 'Rodovia TO-050, km 12', 'Porto Nacional'],
  ['Casa e Obra Comercio de Materiais', '63993440055', 'Av. Central, 240, Centro', 'Paraiso do Tocantins'],
  ['Reforma Facil Servicos', '63994550066', 'Rua das Palmeiras, 88', 'Palmas'],
  ['Constrular Distribuidora', '63995660077', 'Av. Industrial, 4020, Distrito', 'Gurupi'],
  ['Obras Horizonte Engenharia', '63996770088', 'Quadra 210 Sul, Alameda 5', 'Palmas'],
  ['Deposito Cinco Estrelas', '63997880099', 'Rua Boa Vista, 310', 'Miracema do Tocantins'],
];

const PRODUTOS = [
  ['Tijolo 6 furos 9x14x24', 'milheiro', 890.0, 60, 20],
  ['Tijolo 8 furos 11x19x29', 'milheiro', 1180.0, 40, 15],
  ['Tijolo macico 5x10x20', 'milheiro', 1350.0, 25, 10],
  ['Tijolo baiano 9x19x29', 'milheiro', 1020.0, 35, 12],
  ['Laje trelicada H8', 'metro', 42.5, 900, 300],
  ['Tavela ceramica 25x25', 'milheiro', 760.0, 18, 8],
];

const VEICULOS = [
  ['RTB1A23', 'Mercedes Atego 1719 - Carroceria', 12000, 'disponivel'],
  ['QWD2B45', 'Volkswagen Constellation 24.280', 20000, 'disponivel'],
  ['PLM3C67', 'Ford Cargo 1719 - Basculante', 11000, 'em_rota'],
  ['NHT4D89', 'Iveco Tector 240E28', 16000, 'manutencao'],
  ['JKS5E01', 'Volvo VM 270 - Prancha', 18000, 'disponivel'],
];

const MOTORISTAS = ['Joao Ribeiro (demo)', 'Marcos Tavares (demo)', 'Elias Nunes (demo)', 'Paulo Andrade (demo)'];

const USUARIOS = [
  ['Ana Souza (demo)', 'vendas@ceramica.local', 'vendas'],
  ['Carlos Lima (demo)', 'producao@ceramica.local', 'producao'],
  ['Rita Moraes (demo)', 'logistica@ceramica.local', 'logistica'],
];

const TABELAS = [
  'ocorrencias', 'entregas', 'itens_pedido', 'pedidos', 'producao',
  'estoque_movimentos', 'estoque', 'produtos', 'clientes', 'veiculos', 'logs', 'usuarios',
];

const rnd = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const escolha = (arr) => arr[rnd(0, arr.length - 1)];
const senhaAleatoria = () => crypto.randomBytes(9).toString('base64url');

/** Data deslocada em dias a partir de hoje, no formato AAAA-MM-DD. */
function dia(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

async function estaVazio() {
  const n = await db.valor('SELECT COUNT(*)::int AS n FROM usuarios');
  return Number(n) === 0;
}

async function limpar() {
  await db.query(`TRUNCATE ${TABELAS.join(', ')} RESTART IDENTITY CASCADE`);
}

async function popular() {
  const credenciais = [];

  // ---------- usuarios ----------
  const senhaAdmin = config.adminPassword || senhaAleatoria();
  const hashAdmin = await senhaUtil.hash(senhaAdmin);
  await db.query(
    `INSERT INTO usuarios (nome, email, senha_hash, perfil) VALUES ($1, $2, $3, 'admin')`,
    ['Administrador', config.adminEmail, hashAdmin]
  );
  credenciais.push([config.adminEmail, senhaAdmin, 'admin']);

  for (const [nome, email, perfil] of USUARIOS) {
    const senha = DEMO_SENHA_PADRAO || senhaAleatoria();
    const hash = await senhaUtil.hash(senha);
    await db.query(
      'INSERT INTO usuarios (nome, email, senha_hash, perfil) VALUES ($1, $2, $3, $4)',
      [nome, email, hash, perfil]
    );
    credenciais.push([email, senha, perfil]);
  }
  const usuarios = await db.muitos('SELECT id, perfil FROM usuarios ORDER BY id');
  const idPerfil = (p) => (usuarios.find((u) => u.perfil === p) || usuarios[0]).id;

  // ---------- clientes ----------
  for (const [nome, tel, end, cidade] of CLIENTES) {
    await db.query(
      'INSERT INTO clientes (nome, telefone, endereco, cidade) VALUES ($1, $2, $3, $4)',
      [nome, tel, end, cidade]
    );
  }
  const clientes = await db.muitos('SELECT id, endereco FROM clientes ORDER BY id');

  // ---------- produtos + estoque ----------
  for (const [nome, unidade, preco, qtd, minimo] of PRODUTOS) {
    const p = await db.um(
      'INSERT INTO produtos (nome, unidade, preco) VALUES ($1, $2, $3) RETURNING id',
      [nome, unidade, preco]
    );
    await db.query(
      'INSERT INTO estoque (produto_id, quantidade, estoque_minimo) VALUES ($1, $2, $3)',
      [p.id, qtd, minimo]
    );
    await db.query(
      `INSERT INTO estoque_movimentos (produto_id, tipo, quantidade, motivo, origem, usuario_id)
       VALUES ($1, 'entrada', $2, 'Saldo inicial de demonstracao', 'seed', $3)`,
      [p.id, qtd, idPerfil('producao')]
    );
  }
  const produtos = await db.muitos('SELECT id, preco FROM produtos ORDER BY id');

  // ---------- veiculos ----------
  for (const [placa, modelo, cap, status] of VEICULOS) {
    await db.query(
      'INSERT INTO veiculos (placa, modelo, capacidade, status) VALUES ($1, $2, $3, $4)',
      [placa, modelo, cap, status]
    );
  }
  const veiculos = await db.muitos("SELECT id FROM veiculos WHERE status <> 'inativo' ORDER BY id");

  // ---------- producao (ultimos 12 dias) ----------
  for (let d = 12; d >= 0; d--) {
    const quantos = rnd(1, 2);
    for (let k = 0; k < quantos; k++) {
      const prod = escolha(produtos);
      const qtd = rnd(8, 40);
      await db.query(
        `INSERT INTO producao (produto_id, quantidade, perdas, lote, data, observacao, usuario_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [prod.id, qtd, rnd(0, 3), `L${dia(-d).replace(/-/g, '')}-${rnd(1, 9)}`, dia(-d),
         'Queima do forno de demonstracao', idPerfil('producao')]
      );
    }
  }

  // ---------- pedidos, itens, entregas ----------
  const distribuicao = [
    ...Array(4).fill('novo'),
    ...Array(4).fill('confirmado'),
    ...Array(4).fill('em_producao'),
    ...Array(3).fill('pronto'),
    ...Array(3).fill('em_rota'),
    ...Array(6).fill('entregue'),
    'cancelado',
  ];

  let i = 0;
  for (const status of distribuicao) {
    i++;
    const cliente = escolha(clientes);
    const criadoOffset = -rnd(0, 14);
    // Alguns pedidos vencidos para demonstrar o alerta de atraso.
    const entregaOffset = ['entregue', 'cancelado'].includes(status)
      ? criadoOffset + rnd(1, 4)
      : (i % 5 === 0 ? -rnd(1, 3) : rnd(0, 9));

    const pedido = await db.um(
      `INSERT INTO pedidos (cliente_id, data_pedido, data_entrega, status, observacao, usuario_id, criado_em)
       VALUES ($1, $2, $3, $4, $5, $6, NOW() + ($7 || ' days')::interval)
       RETURNING id`,
      [cliente.id, dia(criadoOffset), dia(entregaOffset), status,
       i % 3 === 0 ? 'Entregar pela manha. Portao lateral.' : null,
       idPerfil('vendas'), String(criadoOffset)]
    );

    let total = 0;
    const qtdItens = rnd(1, 3);
    const usados = new Set();
    for (let k = 0; k < qtdItens; k++) {
      const prod = escolha(produtos);
      if (usados.has(prod.id)) continue;
      usados.add(prod.id);
      const qtd = rnd(2, 15);
      const preco = Number(prod.preco);
      total += qtd * preco;
      await db.query(
        'INSERT INTO itens_pedido (pedido_id, produto_id, quantidade, preco_unitario) VALUES ($1, $2, $3, $4)',
        [pedido.id, prod.id, qtd, preco]
      );
    }
    await db.query('UPDATE pedidos SET valor_total = $1 WHERE id = $2', [total.toFixed(2), pedido.id]);

    // Pedidos que ja passaram por "pronto" tiveram baixa de estoque.
    if (['pronto', 'em_rota', 'entregue'].includes(status)) {
      await db.query('UPDATE pedidos SET estoque_baixado = TRUE WHERE id = $1', [pedido.id]);
      const itens = await db.muitos('SELECT produto_id, quantidade FROM itens_pedido WHERE pedido_id = $1', [pedido.id]);
      for (const it of itens) {
        await db.query(
          `UPDATE estoque SET quantidade = GREATEST(quantidade - $1, 0), atualizado_em = NOW() WHERE produto_id = $2`,
          [it.quantidade, it.produto_id]
        );
        await db.query(
          `INSERT INTO estoque_movimentos (produto_id, tipo, quantidade, motivo, origem, pedido_id, usuario_id)
           VALUES ($1, 'saida', $2, $3, 'pedido', $4, $5)`,
          [it.produto_id, it.quantidade, `Separacao do pedido #${pedido.id}`, pedido.id, idPerfil('producao')]
        );
      }
    }

    // Entregas para pedidos prontos ou adiante.
    if (['pronto', 'em_rota', 'entregue'].includes(status)) {
      const statusEntrega = status === 'pronto' ? 'pendente' : (status === 'em_rota' ? 'em_rota' : 'entregue');
      const entrega = await db.um(
        `INSERT INTO entregas (pedido_id, veiculo_id, motorista, endereco, data_prevista, status, data_saida, data_entrega)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [
          pedido.id,
          statusEntrega === 'pendente' ? null : escolha(veiculos).id,
          statusEntrega === 'pendente' ? null : escolha(MOTORISTAS),
          cliente.endereco,
          dia(entregaOffset),
          statusEntrega,
          statusEntrega === 'pendente' ? null : new Date(Date.now() - rnd(2, 72) * 3600000),
          statusEntrega === 'entregue' ? new Date(Date.now() - rnd(1, 48) * 3600000) : null,
        ]
      );
      if (i % 4 === 0) {
        await db.query(
          'INSERT INTO ocorrencias (entrega_id, descricao, usuario_id) VALUES ($1, $2, $3)',
          [entrega.id, 'Acesso ao local estreito. Descarga levou mais tempo que o previsto. (demo)', idPerfil('logistica')]
        );
      }
    }
  }

  await db.query(
    `INSERT INTO logs (usuario_id, usuario_nome, acao, entidade, detalhe, ip)
     VALUES ($1, 'Sistema', 'seed', 'sistema', 'Carga de dados ficticios de demonstracao', 'local')`,
    [idPerfil('admin')]
  );

  return credenciais;
}

/** Popula somente se o banco estiver vazio. Retorna as credenciais criadas ou null. */
async function seedSeVazio() {
  if (!(await estaVazio())) return null;
  return popular();
}

function imprimirCredenciais(credenciais) {
  if (!credenciais) return;
  console.log('');
  console.log('  ================= ACESSOS DE DEMONSTRACAO =================');
  for (const [email, senha, perfil] of credenciais) {
    console.log(`  ${perfil.padEnd(10)} ${email.padEnd(30)} senha: ${senha}`);
  }
  console.log('  Anote agora: as senhas nao sao exibidas novamente.');
  console.log('  ===========================================================');
  console.log('');
}

module.exports = { popular, seedSeVazio, limpar, estaVazio, imprimirCredenciais };

// Execucao direta pela linha de comando
if (require.main === module) {
  (async () => {
    await migrar();
    const reset = process.argv.includes('--reset');
    if (reset) {
      await limpar();
      console.log('[seed] tabelas limpas.');
    }
    if (!reset && !(await estaVazio())) {
      console.log('[seed] o banco ja possui dados. Use "npm run reset" para recriar.');
      await db.pool.end();
      process.exit(0);
    }
    const cred = await popular();
    console.log('[seed] dados ficticios inseridos.');
    imprimirCredenciais(cred);
    await db.pool.end();
    process.exit(0);
  })().catch((err) => {
    console.error('[seed] falhou:', err.message);
    process.exit(1);
  });
}
