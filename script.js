/* =====================================================================
   Preciso Corte, interface do CLIENTE.

   Estrutura:
   1. Camada de dados (FilaService): único lugar que sabe ONDE os dados ficam.
      Hoje usa localStorage; depois será trocada pelo Firebase sem mexer na interface.
   2. Regras da fila (funções puras): elegibilidade, ordem e posição.
   3. Interface: navegação entre telas e renderização.
   ===================================================================== */

const FILAS = {
  barbeiro1: "Barbeiro 1",
  barbeiro2: "Barbeiro 2",
  geral: "Fila geral",
};

/* Status possíveis de um cliente (compartilhados com o projeto dos barbeiros) */
const STATUS = {
  AGUARDANDO: "aguardando",
  EM_ATENDIMENTO: "em_atendimento",
  FINALIZADO: "finalizado",
};

/* ---------- 1. Camada de dados ----------
   Cada cliente tem:
   { clienteId, telefone, email, filaEscolhida, ordemEntrada, status,
     barbeiroAtendimento, dataEntrada }
   TODO Firebase: trocar os métodos abaixo por Firestore.
   - listar(): onSnapshot na coleção "fila" (tempo real);
   - entrar(): addDoc com ordemEntrada gerada no servidor. */
const FilaService = {
  CHAVE: "preciso-corte:fila",
  CHAVE_CLIENTE: "preciso-corte:meuClienteId",

  listar() {
    return JSON.parse(localStorage.getItem(this.CHAVE) || "[]");
  },

  /* Registra a entrada. ordemEntrada é um contador crescente: quem entrou
     antes sempre tem número menor. É a ÚNICA base de prioridade da fila.
     No Firebase, use um contador transacional ou serverTimestamp(),
     nunca o relógio do celular, que pode estar errado. */
  entrar({ telefone, email, filaEscolhida }) {
    const todos = this.listar();
    const ordemEntrada = todos.reduce((m, c) => Math.max(m, c.ordemEntrada), 0) + 1;
    const cliente = {
      clienteId: "c_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
      telefone,
      email,
      filaEscolhida,
      ordemEntrada,
      status: STATUS.AGUARDANDO,
      barbeiroAtendimento: null,
      dataEntrada: new Date().toISOString(),
    };
    localStorage.setItem(this.CHAVE, JSON.stringify([...todos, cliente]));
    localStorage.setItem(this.CHAVE_CLIENTE, cliente.clienteId);
    return cliente;
  },

  remover(clienteId) {
    const restantes = this.listar().filter((c) => c.clienteId !== clienteId);
    localStorage.setItem(this.CHAVE, JSON.stringify(restantes));
    localStorage.removeItem(this.CHAVE_CLIENTE);
  },

  meuClienteId() {
    return localStorage.getItem(this.CHAVE_CLIENTE);
  },

  /* Avisa a interface quando os dados mudarem.
     Hoje: evento "storage" (outra aba) + verificação a cada 3 s.
     TODO Firebase: substituir por onSnapshot, que dispara na hora. */
  observar(callback) {
    window.addEventListener("storage", callback);
    setInterval(callback, 3000);
  },
};

/* ---------- 2. Regras da fila ---------- */

/* Quais filas de barbeiro um cliente enxerga.
   Barbeiro 1 vê: "barbeiro1" OU "geral". Barbeiro 2 vê: "barbeiro2" OU "geral".
   Cliente da fila geral aparece nas duas listas, mas continua sendo UM registro só.
   Quando um barbeiro o chama, status vira "em_atendimento" e ele sai da lista
   de elegíveis do outro barbeiro, evitando atendimento duplo. */
function barbeirosQuePodemAtender(filaEscolhida) {
  return filaEscolhida === "geral" ? ["barbeiro1", "barbeiro2"] : [filaEscolhida];
}

/* Clientes aguardando que um barbeiro pode atender, em ordem de chegada.
   Mesma regra que a tela do barbeiro usará para "Chamar próximo". */
function filaDoBarbeiro(todos, barbeiro) {
  return todos
    .filter((c) => c.status === STATUS.AGUARDANDO)
    .filter((c) => barbeirosQuePodemAtender(c.filaEscolhida).includes(barbeiro))
    .sort((a, b) => a.ordemEntrada - b.ordemEntrada);
}

/* Posição do cliente.
   Não é o total de cadastrados. Contamos só quem:
   1. entrou ANTES (ordemEntrada menor);
   2. ainda está aguardando;
   3. concorre com o cliente pelo mesmo barbeiro.
   Assim, quando alguém é chamado, os seguintes avançam sozinhos.
   Cliente exclusivo: a fila é a do seu barbeiro.
   Cliente geral: ele pode ser chamado por qualquer barbeiro, então a posição
   é a MELHOR (menor) entre as duas filas, a que o chamará primeiro. */
function calcularPosicao(todos, cliente) {
  if (cliente.status !== STATUS.AGUARDANDO) return null;
  const posicaoEm = (barbeiro) =>
    filaDoBarbeiro(todos, barbeiro).findIndex((c) => c.clienteId === cliente.clienteId) + 1;
  return Math.min(...barbeirosQuePodemAtender(cliente.filaEscolhida).map(posicaoEm));
}

/* Quantos aguardam em cada opção (mostrado nos cards).
   A fila geral mostra o total de aguardando, pois qualquer barbeiro atende. */
function contarAguardando(todos, fila) {
  const aguardando = todos.filter((c) => c.status === STATUS.AGUARDANDO);
  return fila === "geral" ? aguardando.length : filaDoBarbeiro(todos, fila).length;
}

/* ---------- 3. Interface ---------- */
const $ = (id) => document.getElementById(id);
const sessao = { telefone: "", email: "", fila: "" }; // dados em preenchimento

function mostrarTela(id) {
  document.querySelectorAll(".screen").forEach((s) => (s.hidden = s.id !== id));
}

function formatarTelefone(v) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/* Validação básica: telefone com DDD (10 ou 11 dígitos) e e-mail em formato válido */
function validarDados(telefone, email) {
  const erros = {};
  const digitos = telefone.replace(/\D/g, "");
  if (digitos.length < 10) erros.telefone = "Digite o telefone com DDD.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) erros.email = "Digite um e-mail válido.";
  return erros;
}

function mostrarErros(erros) {
  ["telefone", "email"].forEach((campo) => {
    $("erro-" + campo).textContent = erros[campo] || "";
    $(campo).setAttribute("aria-invalid", erros[campo] ? "true" : "false");
  });
}

/* Textos de cada estado do atendimento */
function descreverEstado(cliente, posicao) {
  if (cliente.status === STATUS.EM_ATENDIMENTO)
    return posicao === null && cliente.barbeiroAtendimento
      ? { estado: "sua_vez", status: "Em atendimento", aviso: "É a sua vez! Dirija-se ao barbeiro." }
      : { estado: "sua_vez", status: "Sua vez", aviso: "É a sua vez!" };
  if (cliente.status === STATUS.FINALIZADO)
    return { estado: "finalizado", status: "Atendimento finalizado", aviso: "Obrigado pela visita!" };
  if (posicao === 1)
    return { estado: "proximo", status: "Próximo", aviso: "Você é o próximo. Fique por perto." };
  return { estado: "aguardando", status: "Aguardando atendimento", aviso: "" };
}

/* Redesenha a tela de acompanhamento. Chamada a cada mudança nos dados. */
function renderizarPosicao() {
  const todos = FilaService.listar();
  const eu = todos.find((c) => c.clienteId === FilaService.meuClienteId());
  if (!eu) return mostrarTela("tela-inicio"); // removido da fila ou sem registro

  const posicao = calcularPosicao(todos, eu);
  const { estado, status, aviso } = descreverEstado(eu, posicao);

  $("card-posicao").dataset.estado = estado;
  $("posicao").textContent = posicao ? `${posicao}º` : "✓";
  $("aviso").textContent = aviso;
  $("pos-fila").textContent = FILAS[eu.filaEscolhida];
  $("pos-frente").textContent = posicao ? posicao - 1 : "–";
  $("pos-status").textContent = status;
}

function renderizarContagens() {
  const todos = FilaService.listar();
  document.querySelectorAll("[data-contagem]").forEach((el) => {
    const n = contarAguardando(todos, el.dataset.contagem);
    el.textContent = n === 1 ? "1 pessoa\naguardando" : `${n} pessoas\naguardando`;
    el.style.whiteSpace = "pre-line";
  });
}

/* ---------- Eventos ---------- */
$("btn-entrar").addEventListener("click", () => mostrarTela("tela-dados"));

document.querySelectorAll("[data-voltar]").forEach((b) =>
  b.addEventListener("click", () => mostrarTela(b.dataset.voltar))
);

$("telefone").addEventListener("input", (e) => (e.target.value = formatarTelefone(e.target.value)));

$("form-dados").addEventListener("submit", (e) => {
  e.preventDefault();
  const telefone = $("telefone").value.trim();
  const email = $("email").value.trim();
  const erros = validarDados(telefone, email);
  mostrarErros(erros);
  if (Object.keys(erros).length) return;
  Object.assign(sessao, { telefone, email });
  renderizarContagens();
  mostrarTela("tela-fila");
});

document.querySelectorAll("[data-fila]").forEach((card) =>
  card.addEventListener("click", () => {
    sessao.fila = card.dataset.fila;
    $("res-telefone").textContent = sessao.telefone;
    $("res-email").textContent = sessao.email;
    $("res-fila").textContent = FILAS[sessao.fila];
    mostrarTela("tela-confirmar");
  })
);

$("btn-confirmar").addEventListener("click", () => {
  FilaService.entrar({ telefone: sessao.telefone, email: sessao.email, filaEscolhida: sessao.fila });
  renderizarPosicao();
  mostrarTela("tela-posicao");
});

$("btn-sair").addEventListener("click", () => {
  FilaService.remover(FilaService.meuClienteId());
  mostrarTela("tela-inicio");
});

/* Ao abrir o site: se o cliente já está na fila, volta direto ao acompanhamento */
if (FilaService.meuClienteId() && FilaService.listar().some((c) => c.clienteId === FilaService.meuClienteId())) {
  renderizarPosicao();
  mostrarTela("tela-posicao");
}
FilaService.observar(() => {
  if (!$("tela-posicao").hidden) renderizarPosicao();
  if (!$("tela-fila").hidden) renderizarContagens();
});
