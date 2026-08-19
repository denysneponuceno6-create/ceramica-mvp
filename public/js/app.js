/* Cerâmica Fortaleza — JavaScript da interface.
   Sem dependências e sem requisições extras. Faz apenas o que o HTML puro não
   resolve; tudo o que importa continua sendo validado no servidor. */
(function () {
  'use strict';

  var corpo = document.body;

  // ---- Menu lateral no celular (gaveta) -----------------------------
  var botaoMenu = document.getElementById('abrir-menu');
  var veu = document.getElementById('veu');
  var lateral = document.getElementById('lateral');

  var alternarMenu = function (abrir) {
    var aberto = abrir === undefined ? !corpo.classList.contains('menu-aberto') : abrir;
    corpo.classList.toggle('menu-aberto', aberto);
    if (botaoMenu) botaoMenu.setAttribute('aria-expanded', aberto ? 'true' : 'false');
    // Devolve o foco para quem abriu, para quem navega por teclado.
    if (aberto && lateral) {
      var primeiro = lateral.querySelector('.menu a');
      if (primeiro) primeiro.focus();
    } else if (botaoMenu) {
      botaoMenu.focus();
    }
  };

  if (botaoMenu) botaoMenu.addEventListener('click', function () { alternarMenu(); });
  if (veu) veu.addEventListener('click', function () { alternarMenu(false); });

  document.querySelectorAll('[data-abre-menu]').forEach(function (b) {
    b.addEventListener('click', function () { alternarMenu(true); });
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && corpo.classList.contains('menu-aberto')) alternarMenu(false);
  });

  // Ao tocar num link do menu, fecha a gaveta antes de navegar.
  document.querySelectorAll('.lateral .menu a').forEach(function (a) {
    a.addEventListener('click', function () { corpo.classList.remove('menu-aberto'); });
  });

  // ---- Avisos: botão de fechar --------------------------------------
  document.querySelectorAll('[data-fecha-aviso]').forEach(function (b) {
    b.addEventListener('click', function () {
      var aviso = b.closest('.aviso');
      if (aviso) aviso.remove();
    });
  });

  // ---- Pedido: adicionar e remover linhas de item -------------------
  var lista = document.getElementById('itens');
  var botaoAdd = document.getElementById('add-item');

  if (lista && botaoAdd) {
    var modelo = lista.querySelector('.linha-item');

    var atualizarRemocao = function () {
      var linhas = lista.querySelectorAll('.linha-item');
      linhas.forEach(function (linha) {
        var botao = linha.querySelector('.remover-item');
        if (linhas.length > 1 && !botao) {
          var b = document.createElement('button');
          b.type = 'button';
          b.className = 'btn btn-pequeno btn-perigo remover-item';
          b.textContent = 'Remover item';
          b.style.alignSelf = 'end';
          b.addEventListener('click', function () {
            linha.remove();
            atualizarRemocao();
          });
          var caixa = document.createElement('div');
          caixa.className = 'campo';
          caixa.appendChild(b);
          linha.appendChild(caixa);
        } else if (linhas.length === 1 && botao) {
          botao.parentNode.remove();
        }
      });
    };

    botaoAdd.addEventListener('click', function () {
      if (lista.querySelectorAll('.linha-item').length >= 30) {
        botaoAdd.disabled = true;
        return;
      }
      var nova = modelo.cloneNode(true);
      var antigo = nova.querySelector('.remover-item');
      if (antigo) antigo.parentNode.remove();
      nova.querySelectorAll('select, input').forEach(function (campo) {
        if (campo.tagName === 'SELECT') campo.selectedIndex = 0;
        else campo.value = '1';
      });
      lista.appendChild(nova);
      atualizarRemocao();
      var alvo = nova.querySelector('select');
      if (alvo) alvo.focus();
    });

    atualizarRemocao();
  }

  // ---- Entrega: herdar endereço e data do pedido escolhido ----------
  var seletorPedido = document.querySelector('[data-preenche-endereco]');
  if (seletorPedido) {
    var preencher = function () {
      var opcao = seletorPedido.options[seletorPedido.selectedIndex];
      if (!opcao || !opcao.value) return;
      var endereco = document.getElementById('endereco');
      var data = document.getElementById('data_prevista');
      if (endereco && !endereco.value) endereco.value = opcao.getAttribute('data-endereco') || '';
      if (data && opcao.getAttribute('data-data')) data.value = opcao.getAttribute('data-data');
    };
    seletorPedido.addEventListener('change', function () {
      var endereco = document.getElementById('endereco');
      if (endereco) endereco.value = '';
      preencher();
    });
    preencher();
  }

  // ---- WhatsApp: envia a mensagem que está na caixa de texto --------
  // O funcionário pode ajustar o texto antes de enviar; o link é remontado
  // no momento do clique com o que estiver escrito.
  document.querySelectorAll('[data-whatsapp]').forEach(function (link) {
    link.addEventListener('click', function (e) {
      var idCampo = link.getAttribute('data-mensagem-de');
      var campo = idCampo ? document.getElementById(idCampo) : null;
      if (!campo) return;                       // sem caixa de texto, segue o href original
      var texto = (campo.value || '').trim();
      var numero = link.getAttribute('data-whatsapp');
      if (!numero) return;
      e.preventDefault();
      var url = 'https://wa.me/' + numero + (texto ? '?text=' + encodeURIComponent(texto) : '');
      window.open(url, '_blank', 'noopener');
    });
  });

  // ---- Confirmação antes de ações que não dão para desfazer ---------
  document.querySelectorAll('[data-confirmar]').forEach(function (botao) {
    botao.addEventListener('click', function (e) {
      if (!window.confirm(botao.getAttribute('data-confirmar'))) {
        e.preventDefault();
        botao.blur();
      }
    });
  });

  // ---- Feedback de envio: trava o botão e mostra o carregamento -----
  // Evita clique duplo e deixa claro que o sistema está trabalhando.
  document.querySelectorAll('form').forEach(function (form) {
    form.addEventListener('submit', function () {
      var botao = form.querySelector('button[type=submit]');
      if (!botao || botao.disabled) return;

      var rotulo = botao.getAttribute('data-carregando');
      if (rotulo) {
        botao.setAttribute('data-rotulo-original', botao.innerHTML);
        botao.innerHTML = '<span class="girando" aria-hidden="true"></span>' + rotulo;
      }

      // O disable precisa vir depois do envio começar, senão o navegador
      // não manda o valor do botão junto com o formulário.
      setTimeout(function () { botao.disabled = true; }, 0);

      // Rede lenta ou validação do servidor: destrava para poder tentar de novo.
      setTimeout(function () {
        botao.disabled = false;
        var original = botao.getAttribute('data-rotulo-original');
        if (original) botao.innerHTML = original;
      }, 8000);
    });
  });
})();
