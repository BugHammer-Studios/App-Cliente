/* =====================================================================
   Preciso Corte, interface do CLIENTE.

   Estrutura:
   1. Camada de dados (FilaService): único lugar que sabe ONDE os dados ficam (Firebase).
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

/* ---------- Regras do nome ---------- */
const LIMITE_NOME = 50;                              // máximo de caracteres
const REGEX_NOME = /^[\p{L}][\p{L} '.-]*$/u;         // só letras, espaço, ' . -
function normalizarNome(n) { return String(n).replace(/\s+/g, " ").trim(); }

/* ---------- 1. Camada de dados ---------- */
const FilaService = {
  CHAVE_CLIENTE: "preciso-corte:meuClienteId",
  dados: [], carregado: false, ouvindo: false,

  listar() { return this.dados; },
  meuClienteId() { return localStorage.getItem(this.CHAVE_CLIENTE); },

  /* Login anônimo: sem e-mail nem senha, só identifica este aparelho */
  async _login() {
    const fb = await getFirebase();
    let u = await new Promise((ok) => { const off = fb.onAuthStateChanged(fb.auth, (x) => { off(); ok(x); }); });
    if (!u) u = (await fb.signInAnonymously(fb.auth)).user;
    return { fb, uid: u.uid };
  },

  /* Grava na "fila" (dados pessoais, só o admin lê) e em "posicoes" (sem dados pessoais).
     criadoEm vem do servidor, não do relógio do celular. Batch = tudo ou nada. */
  async entrar({ telefone, nome, filaEscolhida }) {
    // Segunda barreira: nunca grava nome acima do limite, mesmo que a tela seja burlada
    nome = normalizarNome(nome);
    if (!nome || nome.length > LIMITE_NOME) throw new Error("Nome inválido ou acima do limite de " + LIMITE_NOME + " caracteres.");

    const { fb, uid } = await this._login();
    const refFila = fb.doc(fb.collection(fb.db, "fila"));
    const refPub = fb.doc(fb.db, "posicoes", refFila.id);
    const b = fb.writeBatch(fb.db);
    b.set(refFila, { nome, telefone: telefone.replace(/\D/g, ""), filaEscolhida, criadoEm: fb.serverTimestamp(), uid });
    b.set(refPub, { filaEscolhida, status: STATUS.AGUARDANDO, criadoEm: fb.serverTimestamp(), uid });
    await b.commit();
    localStorage.setItem(this.CHAVE_CLIENTE, refFila.id);
  },

  async remover(id) {
    const { fb } = await this._login();
    try { await fb.deleteDoc(fb.doc(fb.db, "fila", id)); } catch (e) { /* já chamado/removido */ }
    await fb.deleteDoc(fb.doc(fb.db, "posicoes", id));
    localStorage.removeItem(this.CHAVE_CLIENTE);
  },

  /* Tempo real: onSnapshot na coleção pública */
  async observar(callback) {
    if (this.ouvindo) return;
    this.ouvindo = true;
    try {
      const { fb } = await this._login();
      fb.onSnapshot(fb.collection(fb.db, "posicoes"), (snap) => {
        this.dados = snap.docs.map((d) => {
          const x = d.data({ serverTimestamps: "estimate" });
          return {
            clienteId: d.id, filaEscolhida: x.filaEscolhida, status: x.status, chamadoPor: x.chamadoPor || null,
            ordemEntrada: x.criadoEm ? x.criadoEm.toMillis() : Date.now()
          };
        });
        this.carregado = true;
        callback();
      }, (e) => { console.error(e); this.ouvindo = false; });
    } catch (e) { console.error(e); this.ouvindo = false; }
  },
};

/* ---------- 2. Regras da fila ---------- */

/* Quais filas de barbeiro um cliente enxerga.
   Barbeiro 1 vê: "barbeiro1" OU "geral". Barbeiro 2 vê: "barbeiro2" OU "geral".
   Cliente da fila geral aparece nas duas listas, mas continua sendo UM registro só. */
function barbeirosQuePodemAtender(filaEscolhida) {
  return filaEscolhida === "geral" ? ["barbeiro1", "barbeiro2"] : [filaEscolhida];
}

/* Clientes aguardando que um barbeiro pode atender, em ordem de chegada. */
function filaDoBarbeiro(todos, barbeiro) {
  return todos
    .filter((c) => c.status === STATUS.AGUARDANDO)
    .filter((c) => barbeirosQuePodemAtender(c.filaEscolhida).includes(barbeiro))
    .sort((a, b) => a.ordemEntrada - b.ordemEntrada);
}

/* Posição do cliente: conta só quem entrou antes, ainda aguarda e concorre pelo mesmo barbeiro.
   Cliente geral: a posição é a MELHOR (menor) entre as duas filas. */
function calcularPosicao(todos, cliente) {
  if (cliente.status !== STATUS.AGUARDANDO) return null;
  const posicaoEm = (barbeiro) =>
    filaDoBarbeiro(todos, barbeiro).findIndex((c) => c.clienteId === cliente.clienteId) + 1;
  return Math.min(...barbeirosQuePodemAtender(cliente.filaEscolhida).map(posicaoEm));
}

/* ---------- 3. Interface ---------- */
const $ = (id) => document.getElementById(id);
const sessao = { telefone: "", nome: "", fila: "" }; // dados em preenchimento

function mostrarTela(id) {
  document.querySelectorAll(".screen").forEach((s) => (s.hidden = s.id !== id));
}

function formatarTelefone(v) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/* Validação: telefone com DDD e nome válido (texto, sem números, até LIMITE_NOME) */
function validarDados(telefone, nome) {
  const erros = {};
  const digitos = telefone.replace(/\D/g, "");
  if (digitos.length < 10) erros.telefone = "Digite o telefone com DDD.";
  if (!nome) erros.nome = "Digite seu nome.";
  else if (nome.length > LIMITE_NOME) erros.nome = `O nome pode ter no máximo ${LIMITE_NOME} caracteres.`;
  else if (/\d/.test(nome)) erros.nome = "O nome não pode ter números.";
  else if (!REGEX_NOME.test(nome)) erros.nome = "Use apenas letras no nome.";
  return erros;
}

function mostrarErros(erros) {
  ["telefone", "nome"].forEach((campo) => {
    $("erro-" + campo).textContent = erros[campo] || "";
    $(campo).setAttribute("aria-invalid", erros[campo] ? "true" : "false");
  });
}

/* Aviso de limite do nome: aparece ao chegar em LIMITE_NOME e some ao apagar */
function avisarLimiteNome(forcar) {
  const campo = $("nome");
  const noLimite = campo.value.length >= LIMITE_NOME;
  if (noLimite || forcar) {
    $("erro-nome").textContent = `Você chegou ao limite de ${LIMITE_NOME} caracteres.`;
  } else if ($("erro-nome").textContent.startsWith("Você chegou ao limite")) {
    $("erro-nome").textContent = "";
  }
}

/* Estados visuais da tela de acompanhamento. */
const ESTADOS_TELA = {
  longe:    { classe: "estado-longe",    instrucao: "Você está esperando na fila.",                          status: "Em espera" },
  chegando: { classe: "estado-chegando", instrucao: "Sua vez está chegando, se encaminhe até a barbearia.", status: "Em espera" },
  vez:      { classe: "estado-vez",      instrucao: "Por favor, vá até a barbearia.",                        status: "Sua Vez" },
};

/* Decide o estado pela posição: 1º = vez, 2º e 3º = chegando, 4º em diante = longe. */
function estadoPorPosicao(posicao) {
  if (posicao <= 1) return "vez";
  if (posicao <= 3) return "chegando";
  return "longe";
}

/* Atualiza texto, número e classe. */
function atualizarTelaPosicao(posicao) {
  const tela = document.getElementById("tela-posicao");
  const estado = ESTADOS_TELA[estadoPorPosicao(posicao)];

  tela.classList.remove(...Object.values(ESTADOS_TELA).map((e) => e.classe));
  tela.classList.add(estado.classe);

  document.getElementById("instrucao").textContent = estado.instrucao;
  document.getElementById("posicao").textContent = `${posicao}º`;
  document.getElementById("status").textContent = estado.status;
}

/* Lê os dados da fila e atualiza a tela do cliente atual. */
function renderizarPosicao() {
  if (!FilaService.carregado) return; // espera o 1º retorno do Firestore
  const todos = FilaService.listar();
  const eu = todos.find((c) => c.clienteId === FilaService.meuClienteId());
  if (!eu) { localStorage.removeItem(FilaService.CHAVE_CLIENTE); return mostrarTela("tela-inicio"); }

  // Já chamado: "Sua Vez" e, se houver, mostra qual barbeiro chamou
  if (eu.status === STATUS.EM_ATENDIMENTO) {
    atualizarTelaPosicao(1);
    if (eu.chamadoPor && FILAS[eu.chamadoPor])
      document.getElementById("instrucao").textContent = `Chamado pelo ${FILAS[eu.chamadoPor]}. Por favor, vá até a barbearia.`;
    return;
  }

  if (eu.status === STATUS.FINALIZADO) {
    document.getElementById("instrucao").textContent = "Obrigado pela visita!";
    document.getElementById("posicao").textContent = "✓";
    document.getElementById("status").textContent = "Atendimento finalizado";
    return;
  }
  atualizarTelaPosicao(calcularPosicao(todos, eu));
}

/* ---------- Eventos ---------- */
$("btn-entrar").addEventListener("click", () => mostrarTela("tela-dados"));

document.querySelectorAll("[data-voltar]").forEach((b) =>
  b.addEventListener("click", () => mostrarTela(b.dataset.voltar))
);

$("telefone").addEventListener("input", (e) => (e.target.value = formatarTelefone(e.target.value)));

/* Nome: avisa ao chegar no limite, ao colar texto grande e ao tentar digitar além dele */
$("nome").addEventListener("input", () => avisarLimiteNome(false));
$("nome").addEventListener("beforeinput", (e) => {
  const campo = e.target;
  const semSelecao = campo.selectionStart === campo.selectionEnd;
  if (e.inputType && e.inputType.startsWith("insert") && campo.value.length >= LIMITE_NOME && semSelecao) {
    avisarLimiteNome(true);
  }
});

$("form-dados").addEventListener("submit", (e) => {
  e.preventDefault();
  const telefone = $("telefone").value.trim();
  const nome = normalizarNome($("nome").value);   // tira espaços do início/fim e repetidos
  $("nome").value = nome;
  const erros = validarDados(telefone, nome);
  mostrarErros(erros);
  if (Object.keys(erros).length) return;          // bloqueia: não passa desta tela
  Object.assign(sessao, { telefone, nome });
  mostrarTela("tela-fila");
});

document.querySelectorAll("[data-fila]").forEach((card) =>
  card.addEventListener("click", () => {
    sessao.fila = card.dataset.fila;
    $("res-telefone").textContent = sessao.telefone;
    $("res-nome").textContent = sessao.nome;
    $("res-fila").textContent = FILAS[sessao.fila];
    mostrarTela("tela-confirmar");
  })
);

const aoMudar = () => { if (!$("tela-posicao").hidden) renderizarPosicao(); };

$("btn-confirmar").addEventListener("click", async () => {
  const btn = $("btn-confirmar"); btn.disabled = true;
  try {
    await FilaService.entrar({ telefone: sessao.telefone, nome: sessao.nome, filaEscolhida: sessao.fila });
    $("posicao").textContent = "…";
    mostrarTela("tela-posicao");
    FilaService.observar(aoMudar);
    renderizarPosicao();
  } catch (e) {
    console.error("ERRO AO ENTRAR NA FILA:", e);
    alert("Não foi possível entrar na fila.\n\nCódigo: " + (e.code || e.name || "desconhecido") + "\n" + (e.message || ""));
  } finally { btn.disabled = false; }
});

$("btn-sair").addEventListener("click", async () => {
  try { await FilaService.remover(FilaService.meuClienteId()); mostrarTela("tela-inicio"); }
  catch (e) { console.error(e); alert("Não foi possível sair da fila. Tente de novo."); }
});

/* Ao abrir o site: se este aparelho já tem um cadastro, volta ao acompanhamento */
if (FilaService.meuClienteId()) {
  mostrarTela("tela-posicao");
  FilaService.observar(aoMudar);
}