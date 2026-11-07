/* ============================================================
   LOJAS DOZINFERNO — lógica do front-end (Vanilla JS ES6+).
   Todas as operações de dados passam pelo Supabase (CRUD + auth).
   ============================================================ */

/* ---------- Atalhos de DOM ---------- */
const $  = (seletor) => document.querySelector(seletor);
const $$ = (seletor) => [...document.querySelectorAll(seletor)];

/* ---------- Estado global ---------- */
const state = {
  session: null,
  produtos: [],
  categorias: [],
  carrinho: JSON.parse(localStorage.getItem('dz_carrinho') || '[]'),
  filtro: { busca: '', categoria: null, precoMax: 1000, tamanho: '' },
  editandoId: null
};

/* ---------- Utilitários ---------- */
const formatBRL = (valor) =>
  Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// Toast de feedback (tipo: 'sucesso' | 'erro' | 'info')
function toast(mensagem, tipo = 'info') {
  const el = document.createElement('div');
  el.className = `toast toast--${tipo}`;
  el.textContent = mensagem;
  $('#toasts').appendChild(el);
  requestAnimationFrame(() => el.classList.add('toast--visivel'));
  setTimeout(() => { el.classList.remove('toast--visivel'); setTimeout(() => el.remove(), 300); }, 3500);
}

// Estado de "carregando" em botões
function setLoading(botao, carregando, texto = 'Processando...') {
  if (carregando) {
    botao.dataset.textoOriginal = botao.textContent;
    botao.textContent = texto;
    botao.disabled = true;
  } else {
    botao.textContent = botao.dataset.textoOriginal || botao.textContent;
    botao.disabled = false;
  }
}

// Abre/fecha modais e gaveta do carrinho
function abrirModal(id)  { $(id).hidden = false; document.body.classList.add('sem-scroll'); }
function fecharModal(id) { $(id).hidden = true;  document.body.classList.remove('sem-scroll'); }
function abrirCarrinho()  { $('#gaveta-carrinho').hidden = false; $('#overlay').hidden = false; document.body.classList.add('sem-scroll'); }
function fecharCarrinho() { $('#gaveta-carrinho').hidden = true;  $('#overlay').hidden = true;  document.body.classList.remove('sem-scroll'); }

// Mensagem de erro de formulário
function mostrarErro(idEl, mensagem) {
  const el = $(idEl);
  if (mensagem) { el.textContent = mensagem; el.hidden = false; }
  else { el.hidden = true; }
}

/* ============================================================
   AUTENTICAÇÃO (email/senha, sessão persistente)
   ============================================================ */

// Recupera a sessão salva (getSession) ao carregar a página
async function carregarSessao() {
  const { data: { session }, error } = await supabaseClient.auth.getSession();
  if (error) { toast('Erro ao recuperar a sessão.', 'erro'); return; }
  state.session = session;
  renderizarAreaAuth();
}

// Botão "Entrar" ou nome do usuário + "Sair"
function renderizarAreaAuth() {
  const area = $('#area-auth');
  if (state.session) {
    const nome = state.session.user.user_metadata?.nome || state.session.user.email.split('@')[0];
    area.innerHTML = `
      <span class="menu__usuario" title="${state.session.user.email}">👤 <strong>${nome}</strong></span>
      <button id="btn-sair" class="btn btn--fantasma" type="button">Sair</button>`;
    $('#btn-sair').addEventListener('click', sair);
    $('#btn-novo-produto').hidden = false; // CRUD liberado para usuários logados
  } else {
    area.innerHTML = `<button id="btn-entrar" class="btn btn--primario" type="button">Entrar</button>`;
    $('#btn-entrar').addEventListener('click', () => abrirModal('#modal-auth'));
    $('#btn-novo-produto').hidden = true;
  }
}

// Logout
async function sair() {
  await supabaseClient.auth.signOut();
  state.session = null;
  renderizarAreaAuth();
  renderizarProdutos(); // esconde os botões de editar/excluir
  toast('Você saiu da conta.', 'info');
}

// Abas (Entrar/Cadastrar) e submits dos formulários
function configurarFormulariosAuth() {
  $('#aba-login').addEventListener('click', () => {
    $('#aba-login').classList.add('aba--ativa');
    $('#aba-cadastro').classList.remove('aba--ativa');
    $('#form-login').hidden = false;
    $('#form-cadastro').hidden = true;
  });
  $('#aba-cadastro').addEventListener('click', () => {
    $('#aba-cadastro').classList.add('aba--ativa');
    $('#aba-login').classList.remove('aba--ativa');
    $('#form-cadastro').hidden = false;
    $('#form-login').hidden = true;
  });

  // LOGIN
  $('#form-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    mostrarErro('#erro-login');
    const email = $('#login-email').value.trim();
    const senha = $('#login-senha').value;
    if (!email || !senha) return mostrarErro('#erro-login', 'Preencha e-mail e senha.');

    const btn = e.target.querySelector('button[type="submit"]');
    setLoading(btn, true, 'Entrando...');
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password: senha });
    setLoading(btn, false);

    if (error) return mostrarErro('#erro-login', 'E-mail ou senha incorretos.');
    state.session = data.session;
    renderizarAreaAuth();
    renderizarProdutos();
    fecharModal('#modal-auth');
    e.target.reset();
    toast('Login realizado com sucesso!', 'sucesso');
  });

  // CADASTRO
  $('#form-cadastro').addEventListener('submit', async (e) => {
    e.preventDefault();
    mostrarErro('#erro-cadastro');
    const nome  = $('#cad-nome').value.trim();
    const email = $('#cad-email').value.trim();
    const senha = $('#cad-senha').value;

    // Validação client-side
    if (nome.length < 2) return mostrarErro('#erro-cadastro', 'Informe seu nome.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return mostrarErro('#erro-cadastro', 'Informe um e-mail válido.');
    if (senha.length < 6) return mostrarErro('#erro-cadastro', 'A senha deve ter no mínimo 6 caracteres.');

    const btn = e.target.querySelector('button[type="submit"]');
    setLoading(btn, true, 'Criando conta...');
    const { data, error } = await supabaseClient.auth.signUp({
      email, password: senha,
      options: { data: { nome } } // vai para raw_user_meta_data (usado pelo trigger do SQL)
    });
    setLoading(btn, false);

    if (error) return mostrarErro('#erro-cadastro', error.message);

    // Se a confirmação de e-mail estiver desabilitada no Supabase, a sessão já vem pronta
    if (!data.session) {
      fecharModal('#modal-auth');
      e.target.reset();
      return toast('Conta criada! Verifique seu e-mail para confirmar o cadastro.', 'info');
    }
    state.session = data.session;
    renderizarAreaAuth();
    renderizarProdutos();
    fecharModal('#modal-auth');
    e.target.reset();
    toast('Conta criada! Bem-vindo(a) às Lojas Dozinferno. 🔥', 'sucesso');
  });
}

/* ============================================================
   CATEGORIAS (SELECT)
   ============================================================ */

async function carregarCategorias() {
  const { data, error } = await supabaseClient.from('categorias').select('*').order('nome');
  if (error) { toast('Erro ao carregar categorias.', 'erro'); return; }
  state.categorias = data;
  renderizarFiltroCategorias();
  renderizarSelectCategorias();
}

// Chips de filtro por categoria
function renderizarFiltroCategorias() {
  const caixa = $('#filtro-categorias');
  caixa.innerHTML =
    `<button class="chip chip--ativo" data-categoria="" type="button">Todas</button>` +
    state.categorias.map(c => `<button class="chip" data-categoria="${c.id}" type="button">${c.nome}</button>`).join('');
  caixa.querySelectorAll('.chip').forEach(chip => chip.addEventListener('click', () => {
    state.filtro.categoria = chip.dataset.categoria ? Number(chip.dataset.categoria) : null;
    caixa.querySelectorAll('.chip').forEach(c => c.classList.remove('chip--ativo'));
    chip.classList.add('chip--ativo');
    carregarProdutos();
  }));
}

// <select> de categoria do formulário de produto
function renderizarSelectCategorias() {
  $('#p-categoria').innerHTML =
    '<option value="">Selecione...</option>' +
    state.categorias.map(c => `<option value="${c.id}">${c.nome}</option>`).join('');
}

/* ============================================================
   PRODUTOS — LEITURA (SELECT com filtros)
   ============================================================ */

async function carregarProdutos() {
  const grade = $('#grade-produtos');
  grade.innerHTML = '<p class="carregando">Carregando roupas...</p>';
  $('#msg-vazio').hidden = true;

  let consulta = supabaseClient.from('produtos').select('*, categorias(nome)');
  const f = state.filtro;
  if (f.busca)     consulta = consulta.ilike('nome', `%${f.busca}%`);
  if (f.categoria) consulta = consulta.eq('categoria_id', f.categoria);
  if (f.precoMax && f.precoMax < 1000) consulta = consulta.lte('preco', f.precoMax);
  if (f.tamanho)   consulta = consulta.contains('tamanhos', [f.tamanho]);
  consulta = consulta.order('criado_em', { ascending: false });

  const { data, error } = await consulta;
  if (error) {
    toast('Erro ao carregar produtos: ' + error.message, 'erro');
    grade.innerHTML = '';
    return;
  }
  state.produtos = data || [];
  renderizarProdutos();
}

// Cards de produto
function renderizarProdutos() {
  const grade = $('#grade-produtos');
  $('#msg-vazio').hidden = state.produtos.length > 0;
  const logado = !!state.session;

  grade.innerHTML = state.produtos.map(p => `
    <article class="card">
      <div class="card__imagem">
        ${p.imagem_url ? `<img src="${p.imagem_url}" alt="${p.nome}" loading="lazy" />` : '<span aria-hidden="true">👕</span>'}
        ${p.estoque === 0 ? '<em class="card__esgotado">Esgotado</em>' : ''}
      </div>
      <div class="card__corpo">
        <span class="card__categoria">${p.categorias?.nome || ''}</span>
        <h3 class="card__nome">${p.nome}</h3>
        <p class="card__preco">${formatBRL(p.preco)}</p>
        <p class="card__tamanhos">${(p.tamanhos || []).map(t => `<span>${t}</span>`).join('')}</p>
        <div class="card__acoes">
          <button class="btn btn--primario btn--pequeno" data-add="${p.id}" ${p.estoque === 0 ? 'disabled' : ''} type="button">Adicionar</button>
          ${logado ? `
            <button class="btn btn--fantasma btn--pequeno" data-editar="${p.id}" type="button">Editar</button>
            <button class="btn btn--perigo btn--pequeno" data-excluir="${p.id}" type="button">Excluir</button>` : ''}
        </div>
      </div>
    </article>`).join('');

  grade.querySelectorAll('[data-add]').forEach(b =>
    b.addEventListener('click', () => adicionarAoCarrinho(Number(b.dataset.add))));
  grade.querySelectorAll('[data-editar]').forEach(b =>
    b.addEventListener('click', () => abrirFormProduto(Number(b.dataset.editar))));
  grade.querySelectorAll('[data-excluir]').forEach(b =>
    b.addEventListener('click', () => excluirProduto(Number(b.dataset.excluir))));
}

/* ============================================================
   PRODUTOS — CRIAÇÃO E EDIÇÃO (INSERT / UPDATE)
   ============================================================ */

const TAMANHOS_PADRAO = ['P', 'M', 'G', 'GG', '38', '40', '42', '44'];

// Abre o modal de produto. Se id for informado, entra em modo de edição.
function abrirFormProduto(id = null) {
  if (!state.session) {
    toast('Faça login para gerenciar produtos.', 'erro');
    return abrirModal('#modal-auth');
  }
  state.editandoId = id;
  $('#form-produto').reset();
  mostrarErro('#erro-produto');

  // Checkboxes de tamanho
  $('#p-tamanhos').innerHTML = TAMANHOS_PADRAO.map(t =>
    `<label class="check"><input type="checkbox" value="${t}" /> ${t}</label>`).join('');

  if (id) {
    const p = state.produtos.find(x => x.id === id);
    if (!p) return;
    $('#titulo-produto').textContent = 'Editar roupa';
    $('#p-nome').value = p.nome;
    $('#p-descricao').value = p.descricao || '';
    $('#p-preco').value = p.preco;
    $('#p-categoria').value = p.categoria_id;
    $('#p-cor').value = p.cor || '';
    $('#p-estoque').value = p.estoque;
    $('#p-imagem').value = p.imagem_url || '';
    $$('#p-tamanhos input').forEach(i => { i.checked = (p.tamanhos || []).includes(i.value); });
  } else {
    $('#titulo-produto').textContent = 'Cadastrar roupa';
  }
  abrirModal('#modal-produto');
}

function configurarFormProduto() {
  $('#btn-novo-produto').addEventListener('click', () => abrirFormProduto());

  $('#form-produto').addEventListener('submit', async (e) => {
    e.preventDefault();
    mostrarErro('#erro-produto');

    // Validação client-side
    const nome      = $('#p-nome').value.trim();
    const preco     = parseFloat($('#p-preco').value);
    const categoria = $('#p-categoria').value;
    const estoque   = parseInt($('#p-estoque').value, 10);
    const tamanhos  = $$('#p-tamanhos input:checked').map(i => i.value);

    if (nome.length < 3) return mostrarErro('#erro-produto', 'Informe um nome com pelo menos 3 letras.');
    if (!(preco > 0))    return mostrarErro('#erro-produto', 'Informe um preço válido maior que zero.');
    if (!categoria)      return mostrarErro('#erro-produto', 'Selecione uma categoria.');
    if (Number.isNaN(estoque) || estoque < 0) return mostrarErro('#erro-produto', 'Informe a quantidade em estoque.');
    if (tamanhos.length === 0) return mostrarErro('#erro-produto', 'Selecione ao menos um tamanho.');

    const registro = {
      nome,
      descricao:    $('#p-descricao').value.trim() || null,
      preco,
      categoria_id: Number(categoria),
      cor:          $('#p-cor').value.trim() || null,
      estoque,
      imagem_url:   $('#p-imagem').value.trim() || null,
      tamanhos
    };

    const btn = e.target.querySelector('button[type="submit"]');
    setLoading(btn, true, 'Salvando...');
    let resultado;
    if (state.editandoId) {
      resultado = await supabaseClient.from('produtos').update(registro).eq('id', state.editandoId); // UPDATE
    } else {
      registro.criado_por = state.session.user.id;
      resultado = await supabaseClient.from('produtos').insert(registro); // INSERT
    }
    setLoading(btn, false);

    if (resultado.error) return mostrarErro('#erro-produto', 'Erro ao salvar: ' + resultado.error.message);
    fecharModal('#modal-produto');
    toast(state.editandoId ? 'Roupa atualizada!' : 'Roupa cadastrada!', 'sucesso');
    carregarProdutos();
  });
}

/* ============================================================
   PRODUTOS — EXCLUSÃO (DELETE)
   ============================================================ */

async function excluirProduto(id) {
  const p = state.produtos.find(x => x.id === id);
  if (!confirm(`Excluir "${p?.nome}"? Essa ação não pode ser desfeita.`)) return;
  const { error } = await supabaseClient.from('produtos').delete().eq('id', id);
  if (error) return toast('Erro ao excluir: ' + error.message, 'erro');
  toast('Produto excluído.', 'sucesso');
  carregarProdutos();
}

/* ============================================================
   CARRINHO (persistido no localStorage)
   ============================================================ */

function salvarCarrinho() {
  localStorage.setItem('dz_carrinho', JSON.stringify(state.carrinho));
  renderizarCarrinho();
}

function adicionarAoCarrinho(id) {
  const p = state.produtos.find(x => x.id === id);
  if (!p) return;
  const item = state.carrinho.find(i => i.id === id);
  if (item) item.quantidade++;
  else state.carrinho.push({ id: p.id, nome: p.nome, preco: p.preco, quantidade: 1 });
  salvarCarrinho();
  toast(`${p.nome} adicionado ao carrinho.`, 'sucesso');
}

function removerDoCarrinho(id) {
  state.carrinho = state.carrinho.filter(i => i.id !== id);
  salvarCarrinho();
}

function alterarQuantidade(id, delta) {
  const item = state.carrinho.find(i => i.id === id);
  if (!item) return;
  item.quantidade += delta;
  if (item.quantidade <= 0) removerDoCarrinho(id);
  else salvarCarrinho();
}

const totalCarrinho = () => state.carrinho.reduce((soma, i) => soma + i.preco * i.quantidade, 0);

function renderizarCarrinho() {
  const caixa = $('#itens-carrinho');
  const badge = $('#badge-carrinho');
  const totalItens = state.carrinho.reduce((s, i) => s + i.quantidade, 0);
  badge.hidden = totalItens === 0;
  badge.textContent = totalItens;
  $('#total-carrinho').textContent = formatBRL(totalCarrinho());

  if (state.carrinho.length === 0) {
    caixa.innerHTML = '<p class="vazio">Seu carrinho está vazio. 🛒</p>';
    return;
  }
  caixa.innerHTML = state.carrinho.map(i => `
    <div class="item-carrinho">
      <div><strong>${i.nome}</strong><p>${formatBRL(i.preco)}</p></div>
      <div class="item-carrinho__qtd">
        <button data-qtd="-1" data-id="${i.id}" type="button" aria-label="Diminuir quantidade">−</button>
        <span>${i.quantidade}</span>
        <button data-qtd="1" data-id="${i.id}" type="button" aria-label="Aumentar quantidade">+</button>
      </div>
      <button class="btn btn--perigo btn--pequeno" data-remover="${i.id}" type="button">Remover</button>
    </div>`).join('');
  caixa.querySelectorAll('[data-qtd]').forEach(b =>
    b.addEventListener('click', () => alterarQuantidade(Number(b.dataset.id), Number(b.dataset.qtd))));
  caixa.querySelectorAll('[data-remover]').forEach(b =>
    b.addEventListener('click', () => removerDoCarrinho(Number(b.dataset.remover))));
}

/* ============================================================
   CHECKOUT — INSERT em pedidos + itens_pedido e baixa de estoque
   ============================================================ */

async function finalizarPedido() {
  if (!state.session) {
    fecharCarrinho();
    toast('Faça login para finalizar a compra.', 'erro');
    return abrirModal('#modal-auth');
  }
  if (state.carrinho.length === 0) return toast('Seu carrinho está vazio.', 'erro');

  const btn = $('#btn-finalizar');
  setLoading(btn, true, 'Processando...');
  const total = totalCarrinho();

  // 1) INSERT na tabela pedidos
  const { data: pedido, error: erroPedido } = await supabaseClient
    .from('pedidos')
    .insert({ usuario_id: state.session.user.id, total })
    .select()
    .single();
  if (erroPedido) {
    setLoading(btn, false);
    return toast('Erro ao criar pedido: ' + erroPedido.message, 'erro');
  }

  // 2) INSERT na tabela itens_pedido (um registro por produto)
  const itens = state.carrinho.map(i => ({
    pedido_id: pedido.id, produto_id: i.id, quantidade: i.quantidade, preco_unitario: i.preco
  }));
  const { error: erroItens } = await supabaseClient.from('itens_pedido').insert(itens);
  if (erroItens) {
    setLoading(btn, false);
    return toast('Erro ao salvar itens: ' + erroItens.message, 'erro');
  }

  // 3) Baixa o estoque de cada produto via função RPC (definida no SQL)
  for (const i of state.carrinho) {
    await supabaseClient.rpc('baixar_estoque', { p_id: i.id, p_qtd: i.quantidade });
  }

  setLoading(btn, false);
  state.carrinho = [];
  salvarCarrinho();
  fecharCarrinho();
  toast(`Pedido #${pedido.id} criado com sucesso! 🔥`, 'sucesso');
  carregarProdutos(); // atualiza os cards com o novo estoque
}

/* ============================================================
   PEDIDOS — histórico do usuário logado (SELECT)
   ============================================================ */

async function abrirPedidos() {
  if (!state.session) {
    toast('Faça login para ver seus pedidos.', 'erro');
    return abrirModal('#modal-auth');
  }
  abrirModal('#modal-pedidos');
  const caixa = $('#lista-pedidos');
  caixa.innerHTML = '<p class="carregando">Carregando pedidos...</p>';

  const { data: pedidos, error } = await supabaseClient
    .from('pedidos').select('*').order('criado_em', { ascending: false });
  if (error) { caixa.innerHTML = `<p class="form-erro">${error.message}</p>`; return; }
  if (!pedidos || pedidos.length === 0) {
    caixa.innerHTML = '<p class="vazio">Você ainda não fez nenhum pedido.</p>';
    return;
  }

  // Para cada pedido, busca os itens (e o nome do produto) em paralelo
  const html = await Promise.all(pedidos.map(async (p) => {
    const { data: itens } = await supabaseClient
      .from('itens_pedido')
      .select('quantidade, preco_unitario, produtos(nome)')
      .eq('pedido_id', p.id);
    const linhas = (itens || []).map(i =>
      `<li>${i.quantidade}× ${i.produtos?.nome ?? 'Produto removido'} — ${formatBRL(i.preco_unitario * i.quantidade)}</li>`).join('');
    return `
      <article class="pedido">
        <header><strong>Pedido #${p.id}</strong><span class="pedido__status">${p.status}</span></header>
        <ul>${linhas}</ul>
        <footer>Total: <strong>${formatBRL(p.total)}</strong> · ${new Date(p.criado_em).toLocaleDateString('pt-BR')}</footer>
      </article>`;
  }));
  caixa.innerHTML = html.join('');
}

/* ============================================================
   FILTROS E BUSCA
   ============================================================ */

function configurarFiltros() {
  let timer;
  // Busca com debounce de 300ms
  $('#input-busca').addEventListener('input', (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => { state.filtro.busca = e.target.value.trim(); carregarProdutos(); }, 300);
  });
  $('#filtro-preco').addEventListener('input', (e) => {
    state.filtro.precoMax = Number(e.target.value);
    $('#filtro-preco-valor').textContent = formatBRL(state.filtro.precoMax);
    clearTimeout(timer);
    timer = setTimeout(carregarProdutos, 300);
  });
  $('#filtro-tamanho').addEventListener('change', (e) => {
    state.filtro.tamanho = e.target.value;
    carregarProdutos();
  });
  $('#btn-limpar-filtros').addEventListener('click', () => {
    state.filtro = { busca: '', categoria: null, precoMax: 1000, tamanho: '' };
    $('#input-busca').value = '';
    $('#filtro-preco').value = 1000;
    $('#filtro-preco-valor').textContent = formatBRL(1000);
    $('#filtro-tamanho').value = '';
    $$('#filtro-categorias .chip').forEach((c, idx) => c.classList.toggle('chip--ativo', idx === 0));
    carregarProdutos();
  });
}

/* ============================================================
   MODAIS (fechar por ✕, clique fora ou tecla Esc)
   ============================================================ */

function configurarModais() {
  $$('[data-fechar]').forEach(b => b.addEventListener('click', () => {
    const modal = b.closest('.modal');
    if (modal) fecharModal('#' + modal.id);
    if (b.closest('.gaveta')) fecharCarrinho();
  }));
  $$('.modal').forEach(m => m.addEventListener('click', (e) => {
    if (e.target === m) fecharModal('#' + m.id);
  }));
  $('#overlay').addEventListener('click', fecharCarrinho);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      $$('.modal').forEach(m => { if (!m.hidden) fecharModal('#' + m.id); });
      fecharCarrinho();
    }
  });
}

/* ============================================================
   INICIALIZAÇÃO
   ============================================================ */

document.addEventListener('DOMContentLoaded', async () => {
  configurarModais();
  configurarFormulariosAuth();
  configurarFormProduto();
  configurarFiltros();

  $('#btn-carrinho').addEventListener('click', abrirCarrinho);
  $('#btn-pedidos').addEventListener('click', abrirPedidos);
  $('#btn-finalizar').addEventListener('click', finalizarPedido);

  // Mantém a autenticação sincronizada entre abas/logins
  supabaseClient.auth.onAuthStateChange((_event, session) => {
    state.session = session;
    renderizarAreaAuth();
    renderizarProdutos();
  });

  await carregarSessao();   // sessão persistente (getSession)
  await carregarCategorias();
  await carregarProdutos();
  renderizarCarrinho();
});