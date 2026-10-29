import { expect, test, type Browser, type Page } from "@playwright/test";
import { io, type Socket } from "socket.io-client";
import { MAX_PLAYERS, PLAYER_COLORS, SERVER_PORT } from "@jogo/shared/constants";
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
