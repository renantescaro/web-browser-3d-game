import { expect, test, type Browser, type Page } from "@playwright/test";
import { io, type Socket } from "socket.io-client";
import {
  FISH_MAX_SCALE,
  FISH_MIN_SCALE,
  FOUNTAIN_MAX_FISH,
  FOUNTAIN_MIN_FISH,
  MAX_PLAYERS,
  PLAYER_COLORS,
  SERVER_PORT,
  SQUARE_MAX_BENCHES,
  SQUARE_MIN_BENCHES,
  SQUARE_RADIUS,
  SQUARE_SIGN_TEXT,
  TREE_COUNT,
  TREE_MAX_SCALE,
  TREE_MIN_SCALE,
  WORLD_HALF,
} from "@jogo/shared/constants";
import type { ClientToServerEvents, LobbyMessage, ServerToClientEvents } from "@jogo/shared/protocol";

type BotSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
const SERVER_URL = `http://localhost:${SERVER_PORT}`;

/** Conecta direto no servidor (sem navegador) e devolve a mensagem `lobby`. */
function connectBot(): Promise<{ socket: BotSocket; lobby: LobbyMessage }> {
  return new Promise((resolve, reject) => {
    const socket: BotSocket = io(SERVER_URL, { transports: ["websocket"], forceNew: true });
    socket.once("lobby", (lobby) => resolve({ socket, lobby }));
    socket.once("connect_error", reject);
  });
}

/** Espera a sala esvaziar (jogadores de testes anteriores saindo). */
async function waitForEmptyRoom(): Promise<void> {
  await expect
    .poll(
      async () => {
        const { socket, lobby } = await connectBot();
        socket.disconnect();
        return lobby.playerCount;
      },
      { timeout: 10_000 },
    )
    .toBe(0);
}

/** Abre uma aba nova (contexto isolado), preenche nome e cor e entra no mundo. */
async function joinAs(browser: Browser, name: string, colorIndex: number): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on("pageerror", (err) => {
    throw err;
  });
  await page.goto("/");
  await page.getByPlaceholder("Seu nome").fill(name);
  await page.locator(".color-swatch").nth(colorIndex).click();
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.locator(".join-screen")).toBeHidden();
  await page.waitForFunction(() => window.__jogo !== undefined);
  return page;
}

/** Nomes dos jogadores remotos que a página enxerga. (O rótulo de nome só entra
 * no DOM quando o personagem está na frente da câmera, então não serve para isso.) */
async function remoteNames(page: Page): Promise<string[]> {
  return page.evaluate(() => (window.__jogo?.remotes() ?? []).map((r) => r.name).sort());
}

/** Segura W (girando a câmera para o alvo a cada frame) até chegar a `within` metros de (x, z). */
async function walkTo(page: Page, x: number, z: number, within: number): Promise<void> {
  await page.keyboard.down("ShiftLeft");
  await page.keyboard.down("KeyW");
  await page.waitForFunction(
    ([tx, tz, d]) => {
      const api = window.__jogo;
      if (!api) return false;
      api.lookAt(tx, tz);
      const p = api.local();
      return Math.hypot(p.x - tx, p.z - tz) < d;
    },
    [x, z, within] as const,
    { timeout: 20_000, polling: "raf" },
  );
  await page.keyboard.up("KeyW");
  await page.keyboard.up("ShiftLeft");
}

async function closeAll(pages: Page[]): Promise<void> {
  await Promise.all(pages.map((p) => p.context().close()));
}

test.beforeEach(async () => {
  await waitForEmptyRoom();
});

test("entra com nome e cor e vê o mundo", async ({ browser }) => {
  const page = await joinAs(browser, "Ana", 0);
  await expect(page.locator("canvas")).toBeVisible();
  await expect(page.locator(".name-label", { hasText: "Ana" })).toBeVisible();
  await expect(page.getByTestId("online-count")).toHaveText(`1/${MAX_PLAYERS} online`);
  await closeAll([page]);
});

test("todos veem as mesmas árvores, dentro do mapa e com tamanho limitado", async ({ browser }) => {
  const ana = await joinAs(browser, "Ana", 0);
  const beto = await joinAs(browser, "Beto", 1);
  const treesOf = (page: Page) => page.evaluate(() => window.__jogo?.trees() ?? []);

  const trees = await treesOf(ana);
  expect(trees).toHaveLength(TREE_COUNT);
  for (const t of trees) {
    expect(Math.abs(t.x)).toBeLessThan(WORLD_HALF);
    expect(Math.abs(t.z)).toBeLessThan(WORLD_HALF);
    expect(t.scale).toBeGreaterThanOrEqual(TREE_MIN_SCALE);
    expect(t.scale).toBeLessThanOrEqual(TREE_MAX_SCALE);
  }
  expect(await treesOf(beto)).toEqual(trees);
  await closeAll([ana, beto]);
});

test("existe uma praça com bancos, placa e fonte com peixes nadando", async ({ browser }) => {
  const ana = await joinAs(browser, "Ana", 0);
  const beto = await joinAs(browser, "Beto", 1);
  const squareOf = (page: Page) => page.evaluate(() => window.__jogo?.square() ?? null);

  const square = await squareOf(ana);
  expect(square).not.toBeNull();
  if (!square) return;
  expect(square.signText).toBe(SQUARE_SIGN_TEXT);
  expect(square.benches).toBeGreaterThanOrEqual(SQUARE_MIN_BENCHES);
  expect(square.benches).toBeLessThanOrEqual(SQUARE_MAX_BENCHES);
  expect(square.fish.length).toBeGreaterThanOrEqual(FOUNTAIN_MIN_FISH);
  expect(square.fish.length).toBeLessThanOrEqual(FOUNTAIN_MAX_FISH);

  // Cada peixe tem um tamanho diferente, dentro da faixa.
  const scales = square.fish.map((f) => f.scale);
  expect(new Set(scales).size).toBe(scales.length);
  for (const s of scales) {
    expect(s).toBeGreaterThanOrEqual(FISH_MIN_SCALE);
    expect(s).toBeLessThanOrEqual(FISH_MAX_SCALE);
  }

  // A mesma praça para todos (os peixes nadam localmente, então só o layout é comparado).
  const layout = (s: typeof square) => ({ x: s.x, z: s.z, benches: s.benches, fish: s.fish.map((f) => f.scale) });
  const betoSquare = await squareOf(beto);
  expect(betoSquare && layout(betoSquare)).toEqual(layout(square));

  // Os peixes se movem e não saem da água.
  await expect
    .poll(async () => {
      const later = await squareOf(ana);
      return later?.fish.some((f, i) => {
        const before = square.fish[i];
        return before !== undefined && Math.hypot(f.x - before.x, f.z - before.z) > 0.1;
      });
    })
    .toBe(true);
  const later = await squareOf(ana);
  for (const f of later?.fish ?? []) {
    const r = Math.hypot(f.x, f.z);
    expect(r).toBeGreaterThanOrEqual(square.fountain.innerRadius - 1e-6);
    expect(r).toBeLessThanOrEqual(square.fountain.outerRadius + 1e-6);
  }

  // Nenhuma árvore nasce em cima da praça.
  const trees = await ana.evaluate(() => window.__jogo?.trees() ?? []);
  for (const t of trees) expect(Math.hypot(t.x - square.x, t.z - square.z)).toBeGreaterThan(SQUARE_RADIUS);
  await closeAll([ana, beto]);
});

test("pesca na fonte: botão de Ação vira Pescar, minigame fica mais difícil e o contador persiste", async ({
  browser,
}) => {
  const page = await joinAs(browser, "Pescador", 3);
  const fishing = () => page.evaluate(() => window.__jogo!.fishing());
  const action = page.getByTestId("action-label");
  const panel = page.getByTestId("fishing-panel");
  await expect(action).toContainText("Bater");
  await expect(page.getByTestId("fish-count")).toHaveText("🐟 0");

  // Contorna a placa (que fica entre o centro do mapa e a fonte) e chega na borda da fonte.
  const square = await page.evaluate(() => window.__jogo!.square()!);
  const { x: fx, z: fz } = square.fountain;
  const d = Math.hypot(fx, fz);
  await walkTo(page, fx + (-fz / d) * 4, fz + (fx / d) * 4, 1);
  await walkTo(page, fx, fz, 3.3);
  await expect(action).toContainText("Pescar");

  // Ação na frente da fonte: abre o minigame com a vara na mão (sem soco).
  await page.keyboard.press("KeyF");
  await expect(panel).toBeVisible();
  await expect(action).toContainText("Fisgar");
  await expect.poll(async () => (await page.evaluate(() => window.__jogo!.local())).anim).toBe("fish");
  const firstSpeed = (await fishing()).speed;

  // Aperta quando o marcador estiver dentro da área certa (tenta algumas rodadas).
  for (let attempt = 0; attempt < 5 && (await fishing()).count === 0; attempt++) {
    await page.waitForFunction(
      () => {
        const f = window.__jogo!.fishing();
        const margin = (f.zoneEnd - f.zoneStart) * 0.25;
        return f.phase === "playing" && f.marker > f.zoneStart + margin && f.marker < f.zoneEnd - margin;
      },
      undefined,
      { timeout: 10_000, polling: "raf" },
    );
    await page.keyboard.press("KeyF");
    await expect.poll(async () => (await fishing()).phase).not.toBe("playing");
    await page.waitForTimeout(300);
  }
  await expect(page.getByTestId("fish-count")).toHaveText("🐟 1");

  // A próxima rodada é mais difícil.
  await expect.poll(async () => (await fishing()).phase, { timeout: 5_000 }).toBe("playing");
  expect((await fishing()).speed).toBeGreaterThan(firstSpeed);

  // Sai do minigame e anda pela praça: a contagem continua na tela.
  await page.keyboard.press("KeyQ");
  await expect(panel).toBeHidden();
  await page.keyboard.down("KeyS");
  await page.waitForTimeout(1200);
  await page.keyboard.up("KeyS");
  await expect(action).toContainText("Bater");
  await expect(page.getByTestId("fish-count")).toHaveText("🐟 1");
  await closeAll([page]);
});

test("vê outro jogador se movendo", async ({ browser }) => {
  const ana = await joinAs(browser, "Ana", 0);
  const beto = await joinAs(browser, "Beto", 1);

  await expect.poll(() => remoteNames(beto)).toEqual(["Ana"]);
  await expect.poll(() => remoteNames(ana)).toEqual(["Beto"]);
  await expect(ana.getByTestId("online-count")).toHaveText(`2/${MAX_PLAYERS} online`);

  const remoteAna = () => beto.evaluate(() => window.__jogo?.remotes().find((r) => r.name === "Ana"));
  const start = await remoteAna();
  expect(start).toBeDefined();

  await ana.keyboard.down("KeyW");
  await ana.waitForTimeout(1000);
  await ana.keyboard.up("KeyW");

  await expect
    .poll(async () => {
      const now = await remoteAna();
      return now && start ? Math.hypot(now.x - start.x, now.z - start.z) : 0;
    })
    .toBeGreaterThan(2);

  // Quando Ana sai, Beto deixa de vê-la.
  await closeAll([ana]);
  await expect.poll(() => remoteNames(beto)).toEqual([]);
  await expect(beto.locator(".name-label", { hasText: "Ana" })).toHaveCount(0);
  await closeAll([beto]);
});

test("cor já usada fica indisponível", async ({ browser }) => {
  const ana = await joinAs(browser, "Ana", 3);

  const context = await browser.newContext();
  const beto = await context.newPage();
  await beto.goto("/");
  const takenSwatch = beto.locator(`.color-swatch[data-color="${PLAYER_COLORS[3]}"]`);
  await expect(takenSwatch).toBeDisabled();
  await expect(beto.locator(`.color-swatch[data-color="${PLAYER_COLORS[4]}"]`)).toBeEnabled();

  // Quando Ana sai, a cor volta a ficar livre.
  await closeAll([ana]);
  await expect(takenSwatch).toBeEnabled();
  await closeAll([beto]);
});

test("11º jogador é recusado com sala cheia", async ({ browser }) => {
  const bots: BotSocket[] = [];
  try {
    for (let i = 0; i < MAX_PLAYERS; i++) {
      const { socket } = await connectBot();
      bots.push(socket);
      await new Promise<void>((resolve, reject) => {
        socket.once("welcome", () => resolve());
        socket.once("joinRejected", ({ reason }) => reject(new Error(`bot ${i} recusado: ${reason}`)));
        socket.emit("join", { name: `Bot${i + 1}`, color: PLAYER_COLORS[i] ?? "" });
      });
    }

    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("/");
    await expect(page.locator(".join-status")).toHaveText(`${MAX_PLAYERS}/${MAX_PLAYERS} online`);
    await page.getByPlaceholder("Seu nome").fill("Onze");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByRole("alert")).toHaveText("Sala cheia, tente novamente em instantes");
    await expect(page.locator(".join-screen")).toBeVisible();
    await closeAll([page]);
  } finally {
    for (const b of bots) b.disconnect();
  }
});

test("soco empurra o outro jogador", async ({ browser }) => {
  const ana = await joinAs(browser, "Ana", 0);
  const beto = await joinAs(browser, "Beto", 1);
  await expect.poll(() => remoteNames(ana)).toEqual(["Beto"]);

  // Ana anda até Beto, mirando a câmera nele, até estar perto E virada para ele
  // (o personagem só gira enquanto anda).
  await ana.keyboard.down("KeyW");
  await expect
    .poll(
      async () =>
        ana.evaluate(() => {
          const api = window.__jogo;
          const target = api?.remotes()[0];
          if (!api || !target) return false;
          api.lookAt(target.x, target.z);
          const me = api.local();
          const dx = target.x - me.x;
          const dz = target.z - me.z;
          const dist = Math.hypot(dx, dz);
          const facing = (Math.sin(me.rotationY) * dx + Math.cos(me.rotationY) * dz) / dist;
          return dist < 1.3 && facing > 0.97;
        }),
      { intervals: [50], timeout: 10_000 },
    )
    .toBe(true);
  await ana.keyboard.up("KeyW");
  await ana.waitForTimeout(300);

  const before = await beto.evaluate(() => window.__jogo?.local());
  await ana.keyboard.press("KeyF");
  await expect
    .poll(async () => {
      const now = await beto.evaluate(() => window.__jogo?.local());
      return now && before ? Math.hypot(now.x - before.x, now.z - before.z) : 0;
    })
    .toBeGreaterThan(1);

  await closeAll([ana, beto]);
});

test("no celular mostra controles de toque e o analógico move", async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 915, height: 412 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  await page.goto("/");
  await page.getByPlaceholder("Seu nome").fill("Cel");
  await page.locator(".color-swatch").nth(0).tap();
  await page.getByRole("button", { name: "Entrar" }).tap();
  await page.waitForFunction(() => window.__jogo !== undefined);
  await expect(page.getByTestId("touch-stick")).toBeVisible();
  await expect(page.getByTestId("controls-help")).toContainText("Analógico");

  // Arrasta o analógico para cima, até a borda (corre para frente).
  const box = await page.getByTestId("touch-stick").boundingBox();
  if (!box) throw new Error("analógico sem posição");
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const cdp = await context.newCDPSession(page);
  const before = await page.evaluate(() => window.__jogo?.local());
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 1 }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y - 80, id: 1 }] });
  await expect.poll(async () => (await page.evaluate(() => window.__jogo?.local()))?.anim).toBe("run");
  await page.waitForTimeout(500);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  const after = await page.evaluate(() => window.__jogo?.local());
  expect(after && before ? Math.hypot(after.x - before.x, after.z - before.z) : 0).toBeGreaterThan(0.5);

  await expect(page.getByTestId("touch-action")).toHaveText("Bater");
  await page.getByTestId("touch-action").tap();
  await expect.poll(async () => (await page.evaluate(() => window.__jogo?.local()))?.anim).toBe("punch");

  await context.close();
});

test("no computador mostra a ajuda de teclado e não os controles de toque", async ({ browser }) => {
  const page = await joinAs(browser, "PC", 0);
  await expect(page.getByTestId("controls-help")).toContainText("WASD");
  await expect(page.locator(".touch-controls")).toHaveCount(0);
  await closeAll([page]);
});
