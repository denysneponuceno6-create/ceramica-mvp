-- =====================================================================
-- Ceramica MVP - schema PostgreSQL
-- Idempotente: pode rodar em todo boot sem quebrar (CREATE ... IF NOT EXISTS).
-- Preparado para expansao: colunas novas podem ser adicionadas por ALTER
-- sem reescrever a aplicacao.
-- =====================================================================

-- ------------------------- usuarios -------------------------
CREATE TABLE IF NOT EXISTS usuarios (
  id           SERIAL PRIMARY KEY,
  nome         VARCHAR(120) NOT NULL,
  email        VARCHAR(180) NOT NULL,
  senha_hash   VARCHAR(255) NOT NULL,
  perfil       VARCHAR(20)  NOT NULL DEFAULT 'vendas',
  ativo        BOOLEAN      NOT NULL DEFAULT TRUE,
  ultimo_login TIMESTAMPTZ,
  criado_em    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT usuarios_perfil_ck CHECK (perfil IN ('admin','vendas','producao','logistica'))
);
CREATE UNIQUE INDEX IF NOT EXISTS usuarios_email_uk ON usuarios (LOWER(email));

-- ------------------------- clientes -------------------------
CREATE TABLE IF NOT EXISTS clientes (
  id        SERIAL PRIMARY KEY,
  nome      VARCHAR(140) NOT NULL,
  telefone  VARCHAR(20)  NOT NULL,
  endereco  VARCHAR(255) NOT NULL,
  cidade    VARCHAR(90),
  ativo     BOOLEAN      NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS clientes_nome_ix ON clientes (LOWER(nome));

-- ------------------------- produtos -------------------------
CREATE TABLE IF NOT EXISTS produtos (
  id        SERIAL PRIMARY KEY,
  nome      VARCHAR(140) NOT NULL,
  unidade   VARCHAR(20)  NOT NULL DEFAULT 'milheiro',
  preco     NUMERIC(12,2) NOT NULL DEFAULT 0,
  ativo     BOOLEAN      NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT produtos_preco_ck CHECK (preco >= 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS produtos_nome_uk ON produtos (LOWER(nome));

-- ------------------------- estoque --------------------------
-- Saldo atual por produto (1:1 com produtos).
CREATE TABLE IF NOT EXISTS estoque (
  id             SERIAL PRIMARY KEY,
  produto_id     INTEGER NOT NULL UNIQUE REFERENCES produtos(id) ON DELETE CASCADE,
  quantidade     INTEGER NOT NULL DEFAULT 0,
  estoque_minimo INTEGER NOT NULL DEFAULT 0,
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT estoque_qtd_ck CHECK (quantidade >= 0),
  CONSTRAINT estoque_min_ck CHECK (estoque_minimo >= 0)
);

-- Historico de entradas e saidas (rastreabilidade do saldo).
CREATE TABLE IF NOT EXISTS estoque_movimentos (
  id         SERIAL PRIMARY KEY,
  produto_id INTEGER NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
  tipo       VARCHAR(10) NOT NULL,
  quantidade INTEGER NOT NULL,
  motivo     VARCHAR(160),
  origem     VARCHAR(30) NOT NULL DEFAULT 'manual',
  pedido_id  INTEGER,
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT estoque_mov_tipo_ck CHECK (tipo IN ('entrada','saida','ajuste')),
  CONSTRAINT estoque_mov_qtd_ck  CHECK (quantidade > 0)
);
CREATE INDEX IF NOT EXISTS estoque_mov_produto_ix ON estoque_movimentos (produto_id, criado_em DESC);

-- ------------------------- pedidos --------------------------
CREATE TABLE IF NOT EXISTS pedidos (
  id              SERIAL PRIMARY KEY,
  cliente_id      INTEGER NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
  data_pedido     DATE NOT NULL DEFAULT CURRENT_DATE,
  data_entrega    DATE NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'novo',
  observacao      TEXT,
  valor_total     NUMERIC(12,2) NOT NULL DEFAULT 0,
  estoque_baixado BOOLEAN NOT NULL DEFAULT FALSE,
  usuario_id      INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pedidos_status_ck CHECK (status IN ('novo','confirmado','em_producao','pronto','em_rota','entregue','cancelado'))
);
CREATE INDEX IF NOT EXISTS pedidos_status_ix   ON pedidos (status);
CREATE INDEX IF NOT EXISTS pedidos_cliente_ix  ON pedidos (cliente_id);
CREATE INDEX IF NOT EXISTS pedidos_entrega_ix  ON pedidos (data_entrega);
CREATE INDEX IF NOT EXISTS pedidos_criado_ix   ON pedidos (criado_em DESC);

CREATE TABLE IF NOT EXISTS itens_pedido (
  id             SERIAL PRIMARY KEY,
  pedido_id      INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  produto_id     INTEGER NOT NULL REFERENCES produtos(id) ON DELETE RESTRICT,
  quantidade     INTEGER NOT NULL,
  preco_unitario NUMERIC(12,2) NOT NULL DEFAULT 0,
  CONSTRAINT itens_qtd_ck CHECK (quantidade > 0)
);
CREATE INDEX IF NOT EXISTS itens_pedido_ix ON itens_pedido (pedido_id);

-- ------------------------- producao -------------------------
CREATE TABLE IF NOT EXISTS producao (
  id         SERIAL PRIMARY KEY,
  produto_id INTEGER NOT NULL REFERENCES produtos(id) ON DELETE RESTRICT,
  quantidade INTEGER NOT NULL,
  perdas     INTEGER NOT NULL DEFAULT 0,
  lote       VARCHAR(40) NOT NULL,
  data       DATE NOT NULL DEFAULT CURRENT_DATE,
  observacao VARCHAR(255),
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT producao_qtd_ck    CHECK (quantidade > 0),
  CONSTRAINT producao_perdas_ck CHECK (perdas >= 0)
);
CREATE INDEX IF NOT EXISTS producao_data_ix ON producao (data DESC);

-- ------------------------- veiculos -------------------------
CREATE TABLE IF NOT EXISTS veiculos (
  id         SERIAL PRIMARY KEY,
  placa      VARCHAR(10) NOT NULL,
  modelo     VARCHAR(120) NOT NULL,
  capacidade INTEGER NOT NULL DEFAULT 0,
  status     VARCHAR(20) NOT NULL DEFAULT 'disponivel',
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT veiculos_status_ck CHECK (status IN ('disponivel','em_rota','manutencao','inativo')),
  CONSTRAINT veiculos_cap_ck CHECK (capacidade >= 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS veiculos_placa_uk ON veiculos (UPPER(placa));

-- ------------------------- entregas -------------------------
CREATE TABLE IF NOT EXISTS entregas (
  id            SERIAL PRIMARY KEY,
  pedido_id     INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  veiculo_id    INTEGER REFERENCES veiculos(id) ON DELETE SET NULL,
  motorista     VARCHAR(120),
  endereco      VARCHAR(255) NOT NULL,
  data_prevista DATE NOT NULL,
  data_saida    TIMESTAMPTZ,
  data_entrega  TIMESTAMPTZ,
  status        VARCHAR(20) NOT NULL DEFAULT 'pendente',
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT entregas_status_ck CHECK (status IN ('pendente','em_rota','entregue','falha'))
);
CREATE INDEX IF NOT EXISTS entregas_status_ix  ON entregas (status);
CREATE INDEX IF NOT EXISTS entregas_pedido_ix  ON entregas (pedido_id);
CREATE INDEX IF NOT EXISTS entregas_prevista_ix ON entregas (data_prevista);

CREATE TABLE IF NOT EXISTS ocorrencias (
  id         SERIAL PRIMARY KEY,
  entrega_id INTEGER NOT NULL REFERENCES entregas(id) ON DELETE CASCADE,
  descricao  VARCHAR(500) NOT NULL,
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ocorrencias_entrega_ix ON ocorrencias (entrega_id, criado_em DESC);

-- ------------------------- logs (auditoria) -----------------
CREATE TABLE IF NOT EXISTS logs (
  id          SERIAL PRIMARY KEY,
  usuario_id  INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  usuario_nome VARCHAR(120),
  acao        VARCHAR(60) NOT NULL,
  entidade    VARCHAR(40),
  entidade_id INTEGER,
  detalhe     VARCHAR(500),
  ip          VARCHAR(64),
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS logs_criado_ix   ON logs (criado_em DESC);
CREATE INDEX IF NOT EXISTS logs_usuario_ix  ON logs (usuario_id);
CREATE INDEX IF NOT EXISTS logs_entidade_ix ON logs (entidade, entidade_id);
