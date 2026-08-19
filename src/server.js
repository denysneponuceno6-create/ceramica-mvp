'use strict';
/**
 * Ceramica MVP - ponto de entrada.
 * Comando de inicializacao: node src/server.js  (npm start)
 */
const path = require('path');
const express = require('express');

const config = require('./config');
const db = require('./db');
const { migrar } = require('./db/migrate');
const seed = require('./db/seed');

const cookies = require('./lib/cookies');
const formato = require('./lib/formato');
const dominio = require('./lib/dominio');
const seguranca = require('./middleware/seguranca');
const { carregarSessao, exigirLogin } = require('./middleware/auth');

const rotasAuth = require('./routes/auth');
const rotasDashboard = require('./routes/dashboard');
const rotasClientes = require('./routes/clientes');
const rotasPedidos = require('./routes/pedidos');
const rotasEstoque = require('./routes/estoque');
const rotasProducao = require('./routes/producao');
const rotasEntregas = require('./routes/entregas');
const rotasAdmin = require('./routes/admin');

const app = express();

// No Render a aplicacao roda atras de proxy: necessario para IP real e cookie secure.
if (config.trustProxy) app.set('trust proxy', 1);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('x-powered-by', false);
if (config.isProd) app.set('view cache', true);

// ---------------------------- middlewares ----------------------------
app.use(seguranca.cabecalhos);
app.use(seguranca.limiteGlobal());
app.use(express.urlencoded({ extended: false, limit: '64kb' }));
app.use(cookies);
app.use(carregarSessao);

app.use('/assets', express.static(path.join(__dirname, '..', 'public'), {
  maxAge: config.isProd ? '7d' : 0,
  etag: true,
  index: false,
}));

// Versao dos assets: muda a cada boot, forcando o navegador a baixar o CSS
// novo apos um deploy em vez de reaproveitar a copia em cache por 7 dias.
const versaoAssets = String(Date.now().toString(36));

// Variaveis disponiveis em todas as views.
app.use((req, res, next) => {
  res.locals.f = formato;
  res.locals.d = dominio;
  res.locals.v = versaoAssets;
  res.locals.caminho = req.path;
  res.locals.ok = typeof req.query.ok === 'string' ? req.query.ok.slice(0, 200) : null;
  res.locals.err = typeof req.query.err === 'string' ? req.query.err.slice(0, 300) : null;
  res.locals.titulo = 'Cerâmica Betim';
  next();
});

// ------------------------------ health -------------------------------
// Endpoint leve, sem autenticacao, usado pelo health check do Render.
app.get('/healthz', async (req, res) => {
  const bancoOk = await db.saudavel();
  res.status(bancoOk ? 200 : 503).json({
    status: bancoOk ? 'ok' : 'degradado',
    banco: bancoOk ? 'conectado' : 'indisponivel',
    horario: new Date().toISOString(),
    uptime_s: Math.round(process.uptime()),
  });
});

// ------------------------------ rotas --------------------------------
app.use(seguranca.verificarCsrf);
app.use(rotasAuth);

app.use(exigirLogin);                     // tudo daqui para baixo exige sessao
app.use('/', rotasDashboard);
app.use('/clientes', rotasClientes);
app.use('/pedidos', rotasPedidos);
app.use('/produtos', rotasEstoque.produtos);
app.use('/estoque', rotasEstoque.estoque);
app.use('/producao', rotasProducao);
app.use('/entregas', rotasEntregas.entregas);
app.use('/frota', rotasEntregas.frota);
app.use('/usuarios', rotasAdmin.usuarios);
app.use('/auditoria', rotasAdmin.logs);

// ------------------------- 404 e erro geral --------------------------
app.use((req, res) => {
  res.status(404).render('erro', {
    titulo: 'Pagina nao encontrada',
    codigo: 404,
    mensagem: 'O endereço acessado não existe no sistema.',
  });
});

app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error('[erro]', err.stack || err.message);
  if (res.headersSent) return;
  // Detalhe tecnico nunca vaza para o navegador em producao.
  res.status(500).render('erro', {
    titulo: 'Erro interno',
    codigo: 500,
    mensagem: config.isProd
      ? 'Algo falhou ao processar a solicitação. Tente novamente em instantes.'
      : `Falha: ${err.message}`,
  });
});

// ------------------------------- boot --------------------------------
async function iniciar() {
  console.log(`[boot] ambiente: ${config.env}`);

  try {
    if (config.autoMigrate) {
      await migrar();
      console.log('[boot] schema verificado.');
    }
    if (config.autoSeed) {
      const credenciais = await seed.seedSeVazio();
      if (credenciais) {
        console.log('[boot] banco vazio: dados ficticios inseridos.');
        seed.imprimirCredenciais(credenciais);
      }
    }
  } catch (err) {
    // A aplicacao sobe mesmo assim: /healthz reporta o problema em vez de
    // deixar o deploy em loop de reinicio no Render.
    console.error('[boot] falha ao preparar o banco:', err.message);
  }

  const servidor = app.listen(config.port, '0.0.0.0', () => {
    console.log(`[boot] ouvindo na porta ${config.port}`);
  });

  const encerrar = (sinal) => {
    console.log(`[boot] ${sinal} recebido, encerrando...`);
    servidor.close(() => {
      db.pool.end().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', () => encerrar('SIGTERM'));
  process.on('SIGINT', () => encerrar('SIGINT'));
}

if (require.main === module) iniciar();

module.exports = app;
