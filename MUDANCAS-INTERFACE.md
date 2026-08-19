# Cerâmica Betim — identidade visual e experiência

Documento de acompanhamento do redesenho da interface.
Nenhuma funcionalidade foi removida, nenhuma regra de negócio foi alterada e
nenhuma integração foi trocada. Todas as rotas, permissões, transições de
status, autenticação e consultas ao banco continuam idênticas.

---

## 0. Redesenho para a identidade Cerâmica Betim

A referência enviada define a marca: **carvão como base, terracota e cobre como
acento, brasa como brilho**. O sistema foi refeito nessa direção.

### Por que escuro

A referência é escura — e há um motivo prático que a reforça: o sistema é usado
no galpão e na cabine do caminhão, onde a tela clara cansa a vista e reflete. O
tema escuro reduz o brilho e faz as cores de status saltarem.

| Papel | Cor | Uso |
|---|---|---|
| Base | `#100E0D` carvão | Fundo da área de trabalho |
| Menu | `#15120F` | Casca escura, separada por borda de vidro |
| Cartões | `#1B1715` + vidro | Superfície com `rgba(255,255,255,.035)` por cima |
| Ação | `#D4551D` terracota | Botões primários, item selecionado |
| Brilho | `#F0793A` brasa | Texto de acento, ícone ativo, borda acesa |
| Metálico | `#B8845A` cobre | Eyebrows e rótulos discretos |

**O terracota nunca preenche áreas grandes.** Ele marca ação, seleção e alerta.
O brilho do forno aparece só onde há energia real no sistema: item ativo do
menu, botão da ação principal, tijolo aceso da fiada. Nunca como enfeite.

### Glassmorphism discreto

Cartões e botões usam uma camada de vidro (`rgba(255,255,255,.035)` a `.06`)
sobre a superfície, com borda de `rgba(255,255,255,.085)`. O topo usa
`backdrop-filter: blur(14px)`. É sutil de propósito: em tabela densa, vidro
forte atrapalha a leitura.

### Hero institucional

A fotografia enviada abre o painel, recortada para contar o fluxo real da
empresa — **forno → produção → estoque → caminhão → entrega**. Fica sob um véu
escuro em degradê (mais fechado do lado do texto) para nunca disputar atenção
com os números.

É o **único lugar do sistema com imagem**: nas telas de trabalho, só dado. A
imagem foi recortada (a barra lateral simulada e a faixa de destaques da
referência foram removidas), comprimida para 164 KB e tem versão de 640 px para
o celular, servida por `srcset`.

### Marca

Logotipo redesenhado como **fiada de tijolos desencontrada** em degradê
terracota, com a junta de cima acesa — o mesmo motivo do ícone da referência,
vetorizado. `marca.svg` para a interface e `favicon.svg` para a aba.
Assinatura no rodapé do menu: **Produzimos. Organizamos. Entregamos.**

### Gráfico de produção

O painel ganhou um gráfico de barras dos **últimos 7 dias**, com as perdas de
queima destacadas dentro da barra e o dia de hoje em tom mais claro. É **SVG
desenhado no servidor**, sem biblioteca e sem requisição extra: chega junto com
a página. Os rótulos crescem em unidades do viewBox no celular, para continuarem
legíveis quando o gráfico encolhe.

A única mudança no backend foi **uma consulta de leitura** em
`src/routes/dashboard.js` para montar a série diária. Nenhuma escrita, nenhuma
regra tocada.

### Menu

Reorganizado na ordem pedida, mapeado ao que o sistema realmente tem:

- **Operação** — Painel, Pedidos, Entregas, Caminhões, Clientes
- **Fábrica** — Produção, Estoque, Produtos
- **Administração** — Usuários, Auditoria

O item selecionado tem vidro em terracota e a junta acesa na borda esquerda.

> **Motoristas, Relatórios e Configurações não foram criados.** Não existem
> como módulo no sistema: motorista é um campo de texto na entrega, não uma
> tabela; e não há relatórios nem tela de configurações. Criar itens de menu
> que levam a lugar nenhum piora a experiência. Se esses módulos forem
> desenvolvidos, o menu já está preparado para recebê-los.

---

## Histórico — modernização anterior da interface

Documento de acompanhamento da reformulação visual e de experiência do sistema.
Nenhuma funcionalidade foi removida, nenhuma regra de negócio foi alterada e
nenhuma integração foi trocada. Todas as rotas, permissões, transições de status
e consultas ao banco continuam idênticas.

---

## 1. Direção visual

O sistema pedia identidade de cerâmica e construção. A escolha central foi
**reservar o terracota para ação e marca**, e não usá-lo como papel de parede:

| Elemento | Cor | Por quê |
|---|---|---|
| Ação principal e marca | `#B4441E` terracota | Tijolo queimado. Só aparece onde há algo a fazer, então vira sinal, não decoração. |
| Menu e topo | `#221E1B` fuligem | Casca escura separa a navegação da área de trabalho sem precisar de bordas grossas. |
| Fundo da área de trabalho | `#F1F2F4` cinza-cimento | **Escolha deliberada contra o bege.** Fundo quente embaça as cores de status e derruba o contraste do terracota. O calor da cerâmica fica na casca e no motivo do tijolo. |
| Cartões | branco | Superfície neutra para os dados. |
| Bordas | `#E2E1DF` argamassa | Linha fina, cor de junta. |

### Elemento-assinatura: a fiada

O fluxo do pedido é desenhado como uma **fiada de tijolos**. Cada etapa é um
tijolo: **queimado** (terracota, com marcas de junta) quando há pedidos parados
ali, **cru** (claro) quando a etapa está vazia. No celular a fiada vira uma
parede de duas fiadas 3×2, que cabe na tela sem rolagem lateral.

A mesma lógica aparece em miniatura (`.trilha`) dentro das listas de pedidos.
São os dois únicos lugares que usam o motivo — por isso ele é memorável em vez
de virar textura.

---

## 2. Cores de status padronizadas

Antes, "pendente" era azul e "em rota" era laranja. Agora o padrão é único em
todo o sistema, como pedido:

| Cor | Significado | Onde aparece |
|---|---|---|
| Âmbar | Pendente / em andamento | `pendente`, `em_producao`, `manutencao` |
| Azul | Informação / em rota | `novo`, `confirmado`, `em_rota` |
| Terracota | Pronto para expedição | `pronto` |
| Verde | Concluído | `entregue`, `disponivel` |
| Vermelho | Problema | `falha`, atrasos, estoque a repor |

---

## 3. Tipografia

Duas famílias, com papéis distintos:

- **Inter** — interface, dados, textos. A face mais legível em tela pequena e
  barata, que é onde o motorista vai usar o sistema.
- **Manrope** — títulos e números grandes. Geométrica e larga, com ar de
  sinalização industrial.

**As fontes são auto-hospedadas** em `public/fonts/` (arquivos variáveis woff2,
73 KB no total). Isso foi obrigatório: a CSP do sistema é `font-src 'self'`, e o
Google Fonts seria bloqueado pelo navegador. Como bônus, não há requisição a
terceiros e o carregamento fica mais rápido no 4G. Ambas usam `font-display: swap`,
então o texto aparece imediatamente com a fonte do sistema e troca depois.

Licenças em `public/fonts/LICENSE-*.txt` (SIL Open Font License, uso comercial
liberado).

---

## 4. Responsividade — a mudança de maior impacto

**Tabelas viram cartões abaixo de 780 px.** Antes, toda lista rolava de lado no
celular; o motorista precisava arrastar para ver o status. Agora cada linha vira
um cartão empilhado, com o cliente como título e cada campo rotulado.

A implementação usa `data-rotulo` em cada `<td>`, então **não há marcação
duplicada**: a mesma tabela serve monitor e celular, e qualquer coluna nova
funciona automaticamente nos dois.

Outros ajustes:

- Botões com 44 px de altura mínima (52 px na ação principal) — alvo de toque
  confortável para quem está de pé, no sol, com uma mão.
- Barra de navegação inferior estilo aplicativo: Painel, Entregas, Pedidos, Menu.
- Menu lateral vira gaveta com véu e fechamento por `Esc`.
- Nada de rolagem horizontal em nenhuma tela.

---

## 5. Confirmação de entrega e WhatsApp

O fluxo pedido — **confirmar entrega → gerar mensagem → enviar pelo WhatsApp** —
está montado assim:

1. Na tela da entrega, a ação certa para o momento aparece **sozinha, grande e
   no fim do cartão** (onde o polegar alcança): "Iniciar rota" quando pendente,
   "Confirmar entrega" (verde) quando em rota.
2. Ao confirmar, o sistema responde exatamente **"Entrega confirmada com sucesso."**
3. Logo abaixo, um cartão traz a **mensagem já escrita para o cliente**, adaptada
   à situação da entrega (a caminho / confirmada / problema / programada). O
   funcionário pode revisar o texto antes de enviar.
4. O botão abre o WhatsApp com a mensagem pronta.

**Sobre a integração:** o envio usa `wa.me`, ou seja, é o próprio funcionário
que envia, do número dele. Não exige cadastro, chave de API, servidor extra nem
custo por mensagem — e funciona igual no celular (abre o aplicativo) e no
computador (abre o WhatsApp Web).

Também foram adicionados, na entrega e no cliente:

- **Ligar** — abre o discador com um toque.
- **Abrir no mapa** — leva o endereço direto ao aplicativo de mapas.

---

## 6. Correção importante: estilos inline bloqueados pela CSP

O sistema define `Content-Security-Policy: style-src 'self'`, o que faz o
navegador **ignorar todo atributo `style="..."` escrito na tag**. O código
original tinha 22 desses — larguras de coluna, alinhamentos e, principalmente,
**a largura das barras de estoque no painel**, que simplesmente não apareciam
em produção.

Todos foram convertidos em classes reais. A barra de estoque, que depende de um
valor calculado, agora usa classes em passos de 5% (`.p0` a `.p100`). O sistema
não tem mais nenhum estilo inline, e a CSP continua estrita — sem precisar
afrouxar a segurança com `'unsafe-inline'`.

---

## 7. Escrita da interface

Acentuação corrigida em todo o sistema: telas, rótulos de status, mensagens de
validação, mensagens de erro e textos das rotas. Em um sistema empresarial
brasileiro, "Producao" e "Usuarios" são o indício mais rápido de software
amador.

Botões e mensagens reescritos para dizer o que acontece:

| Antes | Agora |
|---|---|
| Salvar | Salvar dados da entrega |
| Abrir | Abrir entrega / Ver cliente |
| Registrar falha na entrega | Registrar problema na entrega |
| Filtrar / Limpar | Filtrar / Limpar filtros |
| Anterior / Proxima | Página anterior / Próxima página |
| ok / repor | Normal / Repor |
| 2 ocor. | 2 ocorrências registradas |
| Entrega marcada como Entregue. | Entrega confirmada com sucesso. |
| Nao e possivel mudar de… | Não é possível mudar de… |

O status `falha` passou a se chamar **"Problema"** na tela (o valor gravado no
banco continua `falha`, então nada quebra e o histórico segue válido).

Campos vazios deixaram de mostrar traços soltos: agora dizem "A definir",
"Aguardando confirmação", "Não informada" — o funcionário entende se falta
preencher ou se ainda não aconteceu.

---

## 8. Painel reorganizado

A ordem passou a seguir a urgência de quem abre o sistema de manhã:

1. **Avisos que exigem ação** (entregas atrasadas, pedidos aguardando expedição,
   estoque no mínimo) — antes dos números, com link direto para resolver.
2. **Indicadores**, começando por entregas em aberto e entregues hoje.
3. **A fiada** com o fluxo dos pedidos e o faturamento do mês.
4. **Próximas entregas** em largura total — é a tela mais consultada em campo.
5. Pedidos recentes e estoque em atenção.

O indicador "Entregues hoje" passou a ser exibido: o dado já era calculado pelo
sistema, mas não aparecia em lugar nenhum.

---

## 9. Feedback e prevenção de erro

- Ao enviar qualquer formulário, o botão troca o texto e mostra um disco
  girando: "Salvando...", "Confirmando entrega...", "Criando pedido...".
  O botão destrava sozinho após 8 s, para o caso de rede lenta ou erro de
  validação.
- Ações que não dão para desfazer (cancelar pedido, registrar problema) pedem
  confirmação.
- Avisos de sucesso e erro ganharam ícone e botão de fechar.
- Telas vazias deixaram de ser uma frase solta: agora têm ícone, explicação do
  que aconteceu e o botão da próxima ação.

---

## 10. Acessibilidade e desempenho

- Atalho "Ir direto para o conteúdo" para quem navega por teclado.
- Foco visível e consistente em tudo que recebe teclado.
- `prefers-reduced-motion` respeitado.
- Números com largura fixa (`tabular-nums`): colunas de valores e datas ficam
  alinhadas e a leitura em movimento fica mais rápida.
- Folha de estilo única, sem framework, sem requisição externa. As três
  dependências do projeto (`express`, `ejs`, `pg`) continuam as mesmas.

---

## Arquivos alterados

```
public/css/app.css          reescrito (design system completo)
public/js/app.js            reescrito (carregamento, confirmação, WhatsApp)
public/fonts/               novo (Inter e Manrope auto-hospedadas)
src/views/**                todas as 23 telas
src/lib/formato.js          + f.ligar() e f.whatsapp()
src/lib/dominio.js          rótulos acentuados, + ROTULO_MOVIMENTO
src/lib/validate.js         mensagens de validação
src/routes/*.js             mensagens ao usuário
src/middleware/*.js         mensagens ao usuário
```

Nenhum arquivo de banco (`src/db/`), configuração (`src/config.js`) ou
implantação (`render.yaml`) foi tocado.
