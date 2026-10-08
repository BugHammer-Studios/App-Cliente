# Preciso Corte — site do cliente

Site para clientes da barbearia Preciso Corte entrarem em uma fila e acompanharem sua posição. Não oferece agendamento nem escolha de horário.

Este repositório contém a interface do cliente. A integração com um sistema compartilhado para barbeiros ainda não está implementada: atualmente, os dados da fila são guardados no `localStorage` do navegador.

## Fluxo do cliente

1. **Início:** apresenta o site e permite iniciar a entrada na fila.
2. **Identificação:** solicita telefone e nome. O telefone precisa conter DDD (10 ou 11 dígitos) e o nome não pode ficar vazio.
3. **Escolha da fila:** permite selecionar Barbeiro 1, Barbeiro 2 ou Fila geral. A fila geral pode ser atendida por qualquer barbeiro.
4. **Confirmação:** apresenta telefone, nome e fila escolhida antes de confirmar.
5. **Acompanhamento:** mostra a posição, uma tesoura e uma instrução conforme a proximidade da vez. A posição 1 exibe a instrução para ir até a barbearia; as posições 2 e 3 indicam que a vez está chegando; a partir da posição 4, o site informa que o cliente está esperando. A tela não exibe a fila escolhida. Se o status mudar para atendimento, mostra "Sua Vez"; se mudar para finalizado, mostra um símbolo de conclusão e "Atendimento finalizado".

O site guarda o identificador do cliente no navegador. Se a página for reaberta no mesmo navegador enquanto esse cliente ainda estiver registrado, ela volta para o acompanhamento. O botão **Sair da fila** remove o registro do armazenamento local.

## Tecnologias

HTML, CSS e JavaScript. A interface usa a fonte Quicksand do Google Fonts; se não houver conexão, o navegador usa uma fonte de sistema. Não há etapa de compilação.

## Arquivos

```text
├── index.html   # Estrutura das cinco telas do site
├── styles.css   # Estilos e estados visuais
└── script.js    # Dados locais, regras da fila e interação
```

## Como abrir

Abra `index.html` diretamente no navegador ou use a extensão Live Server do VS Code.

## Regras da fila

- A ordem de entrada define a prioridade. `ordemEntrada` é atribuído como o próximo número crescente disponível.
- A fila do Barbeiro 1 inclui entradas para `"barbeiro1"` e `"geral"`.
- A fila do Barbeiro 2 inclui entradas para `"barbeiro2"` e `"geral"`.
- A fila geral é um único registro que pode ser atendido por qualquer um dos barbeiros.
- A posição considera somente os clientes que estão aguardando e podem ser atendidos pelo mesmo barbeiro. Para a fila geral, é usada a melhor posição entre os dois barbeiros.
- Clientes com status diferente de `"aguardando"` não entram no cálculo da posição. Com status `"em_atendimento"`, a tela mostra "Sua Vez" e a posição `1º`; com `"finalizado"`, mostra `✓` e "Atendimento finalizado".

As regras são implementadas em `barbeirosQuePodemAtender()`, `filaDoBarbeiro()` e `calcularPosicao()` em `script.js`.

## Dados armazenados

Cada registro de cliente contém:

| Campo | Descrição |
| --- | --- |
| `clienteId` | Identificador do cliente |
| `telefone` | Telefone informado, formatado na tela |
| `nome` | Nome informado |
| `filaEscolhida` | `"barbeiro1"`, `"barbeiro2"` ou `"geral"` |
| `ordemEntrada` | Número crescente usado para ordenar a fila |
| `status` | `"aguardando"`, `"em_atendimento"` ou `"finalizado"` |
| `barbeiroAtendimento` | Barbeiro que chamou o cliente, quando aplicável |
| `dataEntrada` | Data e hora da entrada, no formato ISO |

O `FilaService` em `script.js` usa as chaves `preciso-corte:fila` e `preciso-corte:meuClienteId` no `localStorage`. Esse armazenamento é local ao navegador e não sincroniza dados entre dispositivos ou com um painel de barbeiro.

## Atualização e teste local

O site verifica alterações a cada três segundos e também escuta o evento `storage`, usado quando outra aba do mesmo site altera o armazenamento.

Para testar manualmente, abra as ferramentas do desenvolvedor do navegador e edite a chave `preciso-corte:fila` em *Application → Local Storage*. Alterar o `status` do registro do cliente permite conferir as mensagens para `"em_atendimento"` e `"finalizado"`. Os dados locais podem ser removidos ao limpar o armazenamento do navegador.

## Personalização

- **Nome, horário e endereço da barbearia:** seção inicial em `index.html`.
- **Cores e aparência:** variáveis no início de `styles.css`.
- **Textos e estados da tela de acompanhamento:** objeto `ESTADOS_TELA` e funções `estadoPorPosicao()`, `atualizarTelaPosicao()` e `renderizarPosicao()` em `script.js`.

## Fora do escopo atual

O site não implementa painel de barbeiro, autenticação, sincronização Firebase, gerenciamento administrativo, agendamento ou calendário. A dependência Firebase listada no `package.json` não é usada pelo fluxo atual do site.
