# Cerâmica Betim — sistema administrativo

Sistema web para a Cerâmica Betim: pedidos, produção, estoque, entregas e frota,
com login por perfil e trilha de auditoria.

Feito para rodar no **Render Free**, com **Node.js + Express + PostgreSQL** e apenas
**3 dependências** (`express`, `ejs`, `pg`).

Fluxo demonstrado de ponta a ponta:

```
PEDIDO → PRODUÇÃO/ESTOQUE → PREPARAÇÃO → ENTREGA → FINALIZAÇÃO
```

A interface foi modernizada: identidade visual de cerâmica, tipografia própria
(auto-hospedada), tabelas que viram cartões no celular e envio de aviso ao
cliente pelo WhatsApp na confirmação da entrega.
Detalhes e justificativas em **[MUDANCAS-INTERFACE.md](MUDANCAS-INTERFACE.md)**.

---

## 1. Executar localmente

Pré-requisitos: Node.js 20+ e um PostgreSQL acessível.

```bash
npm install
cp .env.example .env          # edite DATABASE_URL e SESSION_SECRET
npm run migrate               # cria as tabelas
npm run seed                  # insere os dados fictícios e imprime as senhas
npm start                     # http://localhost:3000
```

Gerar uma `SESSION_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

As credenciais de demonstração são impressas **uma única vez** no terminal, ao final do
seed. Para recriar a base do zero: `npm run reset`.

---

## 2. Publicar no Render

### Opção A — Blueprint (mais rápido)

1. Suba o projeto para um repositório no GitHub.
2. No Render: **Blueprints → New Blueprint Instance** e aponte para o repositório.
3. O arquivo `render.yaml` cria o serviço web e o banco já conectados.
4. Preencha `ADMIN_PASSWORD` quando solicitado (ou deixe vazio e pegue a senha no log).

### Opção B — Manual

1. **New → PostgreSQL**, plano Free. Copie a *Internal Database URL*.
2. **New → Web Service**, conectado ao repositório:
   - Runtime: **Node**
   - Build Command: `npm ci --omit=dev`
   - Start Command: `npm start`
   - Health Check Path: `/healthz`
3. Cadastre as variáveis de ambiente da seção 3.
4. Faça o deploy e abra os **Logs** para ver as credenciais geradas.

> Não defina `PORT` no Render: a plataforma injeta a porta automaticamente e a
> aplicação já a utiliza.

---

## 3. Variáveis de ambiente no Render

| Variável | Obrigatória | Valor no Render | Para que serve |
|---|---|---|---|
| `DATABASE_URL` | **Sim** | *Internal Database URL* do banco | Conexão PostgreSQL |
| `SESSION_SECRET` | **Sim** | string aleatória de 64+ caracteres | Assina os cookies de sessão |
| `NODE_ENV` | **Sim** | `production` | Ativa cookie seguro, cache de views e mensagens de erro genéricas |
| `DATABASE_SSL` | **Sim** | `true` | SSL exigido pelo Postgres gerenciado |
| `TRUST_PROXY` | **Sim** | `true` | IP real e cookie `secure` atrás do proxy |
| `AUTO_MIGRATE` | Recomendada | `true` | Cria/verifica o schema a cada boot (idempotente) |
| `AUTO_SEED` | Recomendada | `true` | Insere dados fictícios **apenas se o banco estiver vazio** |
| `ADMIN_EMAIL` | Opcional | `admin@ceramica.local` | E-mail do administrador criado no seed |
| `ADMIN_PASSWORD` | Opcional | senha forte de sua escolha | Se vazio, gera uma aleatória e mostra no log |
| `DEMO_PASSWORD` | Opcional | — | Senha única para os 3 usuários de demonstração |
| `SESSION_HOURS` | Opcional | `8` | Duração da sessão |
| `PORT` | **Não cadastrar** | — | Injetada pelo Render |

**A aplicação não sobe em produção sem `DATABASE_URL` e `SESSION_SECRET`** — falha no
boot com mensagem clara, em vez de rodar com uma configuração insegura.

---

## 4. Perfis e permissões

| Perfil | Pode fazer |
|---|---|
| **Administrador** | Tudo, incluindo usuários e auditoria |
| **Vendas** | Clientes, criação de pedidos, confirmar e cancelar |
| **Produção** | Registrar produção, movimentar estoque, produzir e marcar como pronto |
| **Logística** | Entregas, ocorrências, frota, iniciar rota e confirmar entrega |

As permissões são verificadas **no servidor a cada requisição**. Esconder um botão na
tela nunca é tratado como proteção.

---

## 5. Estrutura do projeto

```
src/
  server.js              boot, middlewares, rotas, health check
  config.js              lê e valida as variáveis de ambiente
  db/
    index.js             pool pg, helpers e transações
    schema.sql           tabelas, índices e relacionamentos
    migrate.js           aplica o schema (idempotente)
    seed.js              dados fictícios de demonstração
  lib/
    password.js          hash de senha com scrypt (crypto nativo)
    session.js           sessão stateless em cookie assinado (HMAC)
    dominio.js           perfis, permissões, status e transições
    validate.js          validação e normalização de entrada
    auditoria.js         gravação dos logs
    formato.js           formatação pt-BR, links de telefone e WhatsApp
    paginacao.js         paginação de listas
    cookies.js           parser de cookies
  middleware/
    auth.js              sessão, exigir login, exigir permissão
    seguranca.js         cabeçalhos, CSP, rate limiting, CSRF
  routes/                auth, dashboard, clientes, pedidos, estoque, produção, entregas, frota, admin
  views/                 EJS (escape automático)
public/
  css/app.css            design system completo, folha única, sem framework
  js/app.js              gaveta, feedback de envio, confirmação, WhatsApp
  fonts/                 Inter e Manrope auto-hospedadas (a CSP não permite
                         fontes de terceiros; ver MUDANCAS-INTERFACE.md)
  img/                   marca e favicon
```

### Tabelas

`usuarios`, `clientes`, `produtos`, `estoque`, `estoque_movimentos`, `pedidos`,
`itens_pedido`, `producao`, `veiculos`, `entregas`, `ocorrencias`, `logs`.

`estoque_movimentos` foi acrescentada à lista mínima para dar rastreabilidade às
entradas e saídas — sem ela o saldo mudaria sem histórico.

---

## 6. Segurança implementada

- Senhas com **scrypt** (`N=32768, r=8, p=1`), salt por usuário, comparação em tempo constante.
- Sessão em **cookie assinado com HMAC-SHA256**: `httpOnly`, `sameSite=lax`, `secure` em produção.
- **CSRF** em todos os métodos de escrita, incluindo o login (double-submit cookie), com verificação de `Origin`.
- **Rate limiting**: 5 tentativas de login por IP e por IP+e-mail a cada 15 minutos; limite global por IP.
- **SQL Injection**: 100% das consultas parametrizadas (`$1, $2, ...`). Nenhuma concatenação de entrada em SQL.
- **XSS**: EJS escapa por padrão (`<%= %>`); `<%- %>` só é usado em includes de template.
- **CSP** restritiva, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, HSTS em produção.
- Validação e normalização de toda entrada antes de chegar ao banco.
- Mensagem única para credencial inválida (não revela se o e-mail existe).
- Erros internos não vazam stack trace em produção.
- Nenhum segredo no código: tudo vem de variáveis de ambiente; `.env` está no `.gitignore`.
- Sem rota HTTP de seed — a carga de demonstração só roda por comando ou no primeiro boot.

---

## 7. Preparado para crescer

A arquitetura aceita, sem reconstrução: comprovante de entrega e fotos (nova tabela +
storage externo), rastreamento (colunas de GPS em `entregas`), WhatsApp (serviço em
`lib/`), relatórios e indicadores (novas consultas), manutenção de frota (tabela ligada
a `veiculos`), e permissões mais finas (a matriz já está centralizada em
`lib/dominio.js`).

Para migrar a um PostgreSQL de produção, basta trocar `DATABASE_URL` — nada no código
muda.
