# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## O projeto

**Empurrão**: jogo 3D casual de navegador, em terceira pessoa, para até 10 jogadores online. Cada jogador escolhe nome e cor e pode andar, correr, pular, bater e pescar na fonte da praça. **Não há vida nem dano**: o soco só empurra (knockback) e toca uma reação visual.

Stack: Vite + TypeScript 7, Three.js, Rapier (`@dimforge/rapier3d-compat`, character controller cinemático), `CSS2DRenderer` para os nomes, Node.js + Socket.IO no servidor e Playwright para E2E. **Não adicione dependências sem necessidade clara. Nada de React nem engines de jogo.**

## Comandos

```bash
npm install
npm run dev            # cliente (Vite, 5173) + servidor (tsx watch, 3000) via concurrently
npm run typecheck      # tsc --noEmit em shared, server, client e e2e (raiz)
npm run test:e2e       # Playwright; sobe o dev server sozinho se não estiver rodando
npx playwright test -g "soco"              # um teste só, pelo nome
npx playwright test --repeat-each=10       # caçar testes instáveis
npm run build && npm start                 # produção: um processo Node na porta $PORT (padrão 3000)
docker compose up -d --build               # produção em container (ver README para Portainer)
```

Na primeira vez: `npx playwright install chromium`.

**Sempre rode `npm run typecheck` após alterar código, e `npm run test:e2e` após mexer em rede, gameplay ou tela de entrada.** Não há linter configurado.

No Windows, parar o `npm run dev` (ou a tarefa em segundo plano) pode deixar os processos `vite` e `tsx` vivos nas portas 5173/3000; confira e encerre-os.

## Arquitetura

Monorepo com npm workspaces: `shared/`, `server/`, `client/`, além de `e2e/` na raiz.

### `shared/`: fonte única da verdade
- `protocol.ts`: tipos de **todas** as mensagens de rede (`ClientToServerEvents` / `ServerToClientEvents`, tipando o Socket.IO dos dois lados). Mensagem nova ou alterada vai aqui primeiro.
- `constants.ts`: todos os números de gameplay, rede, câmera e validação (velocidades, alcance e cooldown do soco, knockback, paleta `PLAYER_COLORS` etc.). **Nada de números mágicos espalhados.**
- `math.ts`: convenção de ângulo `forwardFromYaw` (yaw 0 olha para +Z, igual ao `rotation.y` do Three.js). Cliente e servidor usam essa mesma função; o cone do soco no servidor depende dela.
- O pacote exporta os `.ts` direto (sem build). O Vite e o `tsx` os consomem como código-fonte; o build do servidor os empacota.

### Modelo de rede
- **Movimento com autoridade do cliente.** Cada cliente simula o próprio personagem e envia `state` a 20 Hz (`TICK_RATE`). O servidor (`Room.updateState`) limita deslocamentos impossíveis (`MAX_PLAUSIBLE_SPEED`) e prende a posição dentro do mapa, sem avisar o cliente.
- **Soco com autoridade do servidor.** O cliente manda só `punch {}`. `Room.punch` checa o cooldown e procura o alvo mais próximo no cone, usando as últimas posições e o `rotationY` conhecidos. Em caso de acerto, envia `hit` para todos. Só o cliente atingido aplica o knockback no próprio controller; os demais tocam a reação visual.
- O servidor faz broadcast de `snapshot` a 20 Hz. O lobby é reenviado a **todos** os sockets (inclusive os que ainda estão na tela de entrada) sempre que alguém entra ou sai; ele alimenta as cores desabilitadas e o "X/10 online".
- **Pesca com contagem no servidor.** O minigame roda no cliente; ao acertar, ele manda `fishCaught {}`. `Room.catchFish` só conta se o jogador estiver junto à fonte e respeitar `FISH_CATCH_COOLDOWN_MS`, e responde `fishCount` só para ele. A contagem é o campo `fishCaught` do `PlayerSnapshot`; na reconexão, o `Network` reenvia o valor no `join` (validado entre 0 e `MAX_FISH_CAUGHT`).
- `validation.ts` valida tudo que chega como `unknown`: nome sanitizado (sem HTML, 1–16 caracteres), cor da paleta, `state` com números finitos e rate limit por "balde de fichas". O motivo de rejeição segue a ordem `full` → `invalidName` → `colorTaken`. Com a sala cheia, as 10 cores estão ocupadas, então o cliente envia `join` sem cor para receber `full`.
- Socket.IO só via websocket, na mesma origem. Em dev, o Vite faz proxy de `/socket.io` para a porta 3000; em produção, o servidor serve `client/dist` e o Socket.IO na mesma porta.
- **Reconexão:** `Network` guarda a sessão (nome + cor) e reenvia `join` a cada `connect`. Um novo `welcome` chega ao `Game` (o id muda), que recria os remotos e mantém a posição local. Um `joinRejected` durante o jogo volta à tela de entrada. Um `join` enviado antes de conectar fica no buffer do Socket.IO.
- A sala vive na memória do processo: **uma instância só**.

### Cliente
- `main.ts` → `JoinScreen` (só sai após `welcome`) → `Game`. O WASM do Rapier (`Physics.init()`) carrega em paralelo, enquanto o jogador preenche o formulário.
- `Game.loop` (requestAnimationFrame), em ordem:
  1. `Input.consume()` gera intenções; os handlers de input **nunca** mexem no jogo.
  2. Câmera gira e converte o WASD para direção no mundo.
  3. `RemotePlayers.update` interpola e posiciona os colliders cinemáticos.
  4. Física em passo fixo de 60 Hz com acumulador: `LocalPlayer.preStep` → `physics.step` → `postStep`.
  5. Renderização interpolada (`alpha` do acumulador).
  6. Envio do `state` a 20 Hz.
- **Posições na rede e na malha são dos pés** (y = 0 no chão). O corpo do Rapier é uma cápsula centrada em `CAPSULE_CENTER_Y` acima dos pés.
- A gravidade é manual no `LocalPlayer` (o mundo Rapier tem gravidade 0). O knockback é uma velocidade horizontal que decai (`KNOCKBACK_DAMPING`) somada ao input. O personagem gira para a direção do **movimento**, não da câmera, e só gira enquanto anda.
- **Remotos:** buffer de estados com o horário convertido para o relógio local (estimativa de offset em `RemotePlayers.applySnapshot`), renderizados `INTERPOLATION_DELAY_MS` no passado; nunca teleportam. A animação de soco remota dispara na transição do `anim` para `"punch"`.
- **Botão de Ação (F, clique ou botão de toque):** é contextual. `FishingController.update` decide o rótulo a cada frame: "Pescar" se o jogador estiver de frente e perto da fonte (`isFacingFountain` em `shared/math.ts`), "Fisgar" durante o minigame e "Bater" no resto. `handleAction` devolve false quando a Ação não é pesca, e aí o `Game` soca. A HUD mostra o rótulo no computador; no celular, quem muda é o texto do próprio botão.
- **Pesca:** `FishingMinigame` é só lógica (marcador que vai e volta numa barra; acertar a área verde = peixe), `FishingPanel` é o DOM e `FishingController` liga tudo. A dificuldade vem de `fishingDifficulty(contagem)`: marcador mais rápido e área menor a cada peixe. Pescando, o `LocalPlayer` fica parado com `anim = "fish"`, que mostra a vara (`entities/FishingRod.ts`) também nos remotos. Sai-se com Q, Esc, soltando o mouse, o botão Sair ou andando/pulando. A HUD mostra sempre "🐟 N".
- **Celular:** `isTouchDevice()` (`pointer: coarse`) decide o modo. No celular, `TouchControls` cria analógico (inclinar até a borda = correr), botões Pular/Ação e arrastar a tela para girar a câmera; o `Input` mescla essas intenções com as do teclado e não usa pointer lock. A `Hud` mostra a ajuda de toque ou a de teclado conforme o modo.
- **Música:** `Music.ts` compõe e sintetiza um loop com Web Audio (sem arquivos de áudio). O `AudioContext` só é criado no primeiro gesto do usuário (já na tela de entrada); tecla M ou botão 🎵 da HUD liga/desliga (lembrado no `localStorage`) e a música pausa com a aba oculta.
- **Árvores:** o servidor sorteia `TREE_COUNT` árvores ao iniciar (`server/src/Trees.ts`: tipo, posição longe do centro e das outras, escala entre `TREE_MIN_SCALE` e `TREE_MAX_SCALE`) e as envia no `welcome`. No cliente, `TreesManager` cria a malha e um cilindro fixo do Rapier (o jogador colide; o servidor e os animais não sabem delas). Tipo novo: adicione em `TREE_TYPES` (protocolo), crie a subclasse de `entities/trees/Tree.ts` e registre em `TREE_FACTORIES`.
- **Praça:** o servidor gera **exatamente uma** praça ao iniciar (`server/src/Square.ts`), antes das árvores, que evitam a área dela. Ela fica entre `SQUARE_MIN_DISTANCE` e `SQUARE_MAX_DISTANCE` do centro, com 2–5 bancos virados para a fonte, uma placa com `SQUARE_SIGN_TEXT` na borda virada para o centro do mapa e uma fonte com 2–5 peixes (cada um com tamanho diferente). Vai no `welcome` como `square`. No cliente, `SquareManager` monta os modelos de `entities/square/` e os colisores (fonte, coluna, bancos e placa). O `Fountain` contém os peixes; o nado (`Fish.update`) roda **só no cliente**, por ser decorativo, então a posição dos peixes não é igual entre jogadores.
- Modelos estáticos de primitivas (árvores, objetos da praça) herdam de `entities/Model.ts`, que registra geometrias, materiais e texturas para o `dispose()`.
- `Character.ts` monta a pessoa com primitivas e faz todas as animações procedurais (parado, andar, correr, pulo, soco e atingido). Recursos do Three.js precisam de `dispose()` ao remover um personagem, incluindo o elemento DOM do rótulo.

### Testes E2E e API de debug
- Em modo dev (`import.meta.env.DEV`), o `Game` expõe `window.__jogo` com `selfId`, `local`, `remotes`, `lookAt`, `trees`, `square` e `fishing`. Os testes dependem dela; os tipos estão duplicados em `e2e/global.d.ts`, mantenha os dois em sincronia. Ela não existe no build de produção.
- **O `CSS2DRenderer` só insere o rótulo de nome no DOM quando o personagem está na frente da câmera.** Não use `.name-label` para checar se um jogador existe; use `__jogo.remotes()`.
- Os testes compartilham uma sala real: rodam com `workers: 1`, esperam a sala esvaziar no `beforeEach` e fecham os contextos no fim. O teste de "sala cheia" usa 10 bots `socket.io-client` em Node, sem navegador.
- WebGL headless usa SwiftShader (flags no `playwright.config.ts`).

## Convenções

- TypeScript `strict` + `noUncheckedIndexedAccess`; **sem `any`** (use `unknown` + validação). Imports com `moduleResolution: bundler`; no servidor, os imports relativos usam o sufixo `.js`.
- Um arquivo por classe ou sistema, **no máximo ~300 linhas**; se passar disso, divida.
- Comentários e textos da interface em **português**; nomes de código em inglês.
- Logs do servidor curtos (entrada, saída, rejeição, início/fim). Nada de log por frame.
- Three.js 0.186: `PCFSoftShadowMap` foi removido (use `PCFShadowMap`).

## Como verificar mudanças visuais ou de gameplay

O typecheck não pega bugs de 3D. Depois de mudanças visuais ou de gameplay:
1. Rode `npm run dev` e abra `http://localhost:5173` com Playwright, usando um script descartável que importe `@playwright/test` de `node_modules`.
2. Entre com nome e cor, tire um screenshot e confira chão, personagem, nome e câmera.
3. Leia o console do navegador e corrija erros e warnings.
4. Para multiplayer, abra duas abas (contextos separados) e confira movimento e soco.

O pointer lock (câmera pelo mouse e soco por clique) não funciona no headless; teste o soco pela tecla F.

## Fora do escopo (por enquanto)

Vida, dano, morte e placar; contas e persistência; modelos 3D externos e animações por esqueleto; mais de uma sala ou servidor.
