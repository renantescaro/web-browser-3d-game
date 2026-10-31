import { expect, test, type Browser, type Page } from "@playwright/test";
import { io, type Socket } from "socket.io-client";
import {
  ANIMAL_FOLLOW_DISTANCE,
  CLOTHING_SELLER_NAME,
  CLOTHING_SHOP_RANGE,
  CLOTHING_SIGN_TEXT,
  OUTFIT_BUY_COOLDOWN_MS,
  FISH_MAX_SCALE,
  FISH_MIN_SCALE,
  FOUNTAIN_MAX_FISH,
  FOUNTAIN_MIN_FISH,
  MAX_PLAYERS,
  MERCHANT_SIGN_TEXT,
  MERCHANT_TRADE_RANGE,
  PLAYER_COLORS,
  SERVER_PORT,
  SHOOTING_ENTRY_COST,
  SHOOTING_OWNER_NAME,
  SHOOTING_PLAY_RANGE,
  SHOOTING_PRIZE,
  SHOOTING_SHOT_COOLDOWN_MS,
  SHOOTING_SIGN_TEXT,
  SHOOTING_TARGETS_TO_WIN,
  SPAWN_MAX_DISTANCE,
  SPAWN_MIN_DISTANCE,
  SQUARE_MAX_BENCHES,
  SQUARE_MIN_BENCHES,
  SQUARE_RADIUS,
  SQUARE_SIGN_TEXT,
  CHOP_COOLDOWN_MS,
  LUMBER_BUYER_NAME,
  LUMBER_SIGN_TEXT,
  TOOL_BUY_COOLDOWN_MS,
  TOOL_SELLER_NAME,
  TOOL_SHOP_RANGE,
  TOOL_SIGN_TEXT,
  TREE_COUNT,
  TREE_MAX_SCALE,
  TREE_MIN_SCALE,
  WOOD_PER_TREE,
  WOOD_SELL_COOLDOWN_MS,
  WOOD_SELL_PRICE,
  WORLD_HALF,
} from "@jogo/shared/constants";
import { ITEMS } from "@jogo/shared/items";
import { OUTFIT_ITEMS, type Outfit } from "@jogo/shared/outfits";
import { INVENTORY_ITEMS, INVENTORY_SLOTS, type Inventory } from "@jogo/shared/inventory";

const STACK = INVENTORY_ITEMS.fish.stack;
import { MAX_TOOLS, TOOL_ITEMS } from "@jogo/shared/tools";
import type {
  AnimalSnapshot,
  AnimalType,
  ClientToServerEvents,
  ClothingShopData,
  LobbyMessage,
  LumberMillData,
  MerchantData,
  MerchantStock,
  PlayerSnapshot,
  ServerToClientEvents,
  ShootingBoothData,
  ShootingResultMessage,
  ShootingStateMessage,
  ToolShopData,
  TreeData,
  Vec3,
} from "@jogo/shared/protocol";

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

/**
 * Todos nascem na praça olhando para a fonte. Gira a câmera para um ponto mais à frente no anel
 * entre a fonte e os bancos, para "W" andar alguns metros sem bater em nada.
 */
async function faceAlongFountain(page: Page): Promise<void> {
  await page.evaluate(() => {
    const api = window.__jogo!;
    const { x: fx, z: fz } = api.square()!.fountain;
    const me = api.local();
    const start = Math.atan2(me.x - fx, me.z - fz);
    const point = (turn: number) => ({ x: fx + Math.sin(start + turn) * 4.8, z: fz + Math.cos(start + turn) * 4.8 });
    // Vai para o lado mais longe dos outros jogadores (que também nascem no anel).
    const clearance = (turn: number) => {
      const p = point(turn);
      return Math.min(Infinity, ...api.remotes().map((r) => Math.hypot(r.x - (me.x + p.x) / 2, r.z - (me.z + p.z) / 2)));
    };
    const target = clearance(1.2) >= clearance(-1.2) ? point(1.2) : point(-1.2);
    api.lookAt(target.x, target.z);
  });
}

async function closeAll(pages: Page[]): Promise<void> {
  await Promise.all(pages.map((p) => p.context().close()));
}

/**
 * Contorna a placa (que fica entre o centro do mapa e a fonte) pelo lado oposto à barraca
 * do comerciante (que fica ao lado da placa) e chega na borda da fonte.
 */
async function walkToFountain(page: Page): Promise<void> {
  const square = await page.evaluate(() => window.__jogo!.square()!);
  const merchant = await page.evaluate(() => window.__jogo!.merchant()!);
  const { x: fx, z: fz } = square.fountain;
  const d = Math.hypot(fx, fz);
  const side = [1, -1]
    .map((s) => ({ x: fx + ((s * -fz) / d) * 4, z: fz + ((s * fx) / d) * 4 }))
    .sort((a, b) => Math.hypot(b.x - merchant.x, b.z - merchant.z) - Math.hypot(a.x - merchant.x, a.z - merchant.z))[0]!;
  await walkTo(page, side.x, side.z, 1);
  await walkTo(page, fx, fz, 3.3);
}

/** Com o minigame aberto, aperta quando o marcador estiver na área certa (tenta algumas rodadas). */
async function hookOneFish(page: Page): Promise<void> {
  const fishing = () => page.evaluate(() => window.__jogo!.fishing());
  const start = (await fishing()).count;
  for (let attempt = 0; attempt < 5 && (await fishing()).count === start; attempt++) {
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
}

/** Quantas unidades de `item` a barra de inventário da HUD mostra (somando os espaços). */
function hudCount(page: Page, item: string): Promise<number> {
  return page.evaluate(
    (id) =>
      [...document.querySelectorAll<HTMLElement>(`[data-testid="inventory"] .hud-slot[data-item="${id}"]`)].reduce(
        (sum, slot) => sum + Number(slot.dataset.count ?? 0),
        0,
      ),
    item,
  );
}

/** Bot com peixes (e dinheiro) no inventário, como numa reconexão, que anda mandando `state` direto. */
class FishBot {
  position: Vec3 = { x: 0, y: 0, z: 0 };
  animals: AnimalSnapshot[] = [];
  fishCounts: number[] = [];
  fedAnimals: string[] = [];
  moneys: number[] = [];
  stocks: MerchantStock[] = [];
  merchant: MerchantData | null = null;
  shootingBooth: ShootingBoothData | null = null;
  clothingShop: ClothingShopData | null = null;
  toolShop: ToolShopData | null = null;
  /** Cada `inventory` recebido. `fishCounts` e `axeCounts` são os peixes e machados de cada um. */
  inventories: Inventory[] = [];
  axeCounts: number[] = [];
  toolSales: string[] = [];
  lumberMill: LumberMillData | null = null;
  /** Quem vendeu madeira ao Brenno (`woodSold`). */
  woodSales: string[] = [];
  /** Inventário informado no `welcome`. */
  initialInventory: Inventory = {};
  trees: TreeData[] = [];
  choppedTrees: string[] = [];
  /** Centro da fonte da praça. */
  fountain: Vec3 = { x: 0, y: 0, z: 0 };
  outfits: Outfit[] = [];
  outfitSales: string[] = [];
  players: PlayerSnapshot[] = [];
  /** Roupas informadas no `welcome`. */
  initialOutfit: Outfit = {};
  shootingStates: ShootingStateMessage[] = [];
  shootingResults: ShootingResultMessage[] = [];
  /** Dinheiro informado no `welcome`. */
  initialMoney = 0;
  private readonly types = new Map<string, AnimalType>();

  private constructor(readonly socket: BotSocket) {
    socket.on("snapshot", (msg) => {
      this.animals = msg.animals;
      this.players = msg.players;
    });
    socket.on("outfit", ({ outfit }) => this.outfits.push(outfit));
    socket.on("outfitSold", ({ playerId }) => this.outfitSales.push(playerId));
    socket.on("inventory", ({ inventory }) => {
      this.inventories.push(inventory);
      this.fishCounts.push(inventory.fish ?? 0);
      this.axeCounts.push(inventory.axe ?? 0);
    });
    socket.on("toolSold", ({ playerId }) => this.toolSales.push(playerId));
    socket.on("woodSold", ({ playerId }) => this.woodSales.push(playerId));
    socket.on("treeChopped", ({ treeId }) => this.choppedTrees.push(treeId));
    socket.on("animalFed", ({ animalId }) => this.fedAnimals.push(animalId));
    socket.on("money", ({ amount }) => this.moneys.push(amount));
    socket.on("merchantStock", ({ stock }) => this.stocks.push(stock));
    socket.on("shooting", (msg) => this.shootingStates.push(msg));
    socket.on("shootingResult", (msg) => this.shootingResults.push(msg));
  }

  static async join(
    name: string,
    color: string,
    fishCaught: number,
    money = 0,
    outfit?: unknown,
    /** Mais itens no inventário reenviado (pode ter lixo, para testar a validação). */
    inventory?: Record<string, unknown>,
  ): Promise<FishBot> {
    const { socket } = await connectBot();
    const bot = new FishBot(socket);
    const welcome = await new Promise<Parameters<ServerToClientEvents["welcome"]>[0]>((resolve, reject) => {
      socket.once("welcome", resolve);
      socket.once("joinRejected", ({ reason }) => reject(new Error(`bot recusado: ${reason}`)));
      socket.emit("join", { name, color, money, outfit: outfit as Outfit, inventory: { fish: fishCaught, ...inventory } as Inventory });
    });
    const self = welcome.players.find((p) => p.id === welcome.selfId);
    if (self) {
      bot.position = self.position;
      bot.initialMoney = self.money;
      bot.initialOutfit = self.outfit;
      bot.initialInventory = self.inventory;
    }
    bot.merchant = welcome.merchant;
    bot.shootingBooth = welcome.shootingBooth;
    bot.clothingShop = welcome.clothingShop;
    bot.toolShop = welcome.toolShop;
    bot.lumberMill = welcome.lumberMill;
    bot.trees = welcome.trees;
    bot.fountain = welcome.square.fountain.position;
    for (const a of welcome.animals) bot.types.set(a.id, a.type);
    await expect.poll(() => bot.animals.length).toBe(welcome.animals.length);
    return bot;
  }

  get id(): string {
    return this.socket.id ?? "";
  }

  animal(id: string): AnimalSnapshot | undefined {
    return this.animals.find((a) => a.id === id);
  }

  /** Anda (a 20 m/s, abaixo do limite do servidor) até ficar a `within` metros do alvo, que pode se mover. */
  async walkTo(target: () => { x: number; z: number } | undefined, within: number): Promise<void> {
    const step = 1;
    for (let i = 0; i < 600; i++) {
      const t = target();
      if (!t) throw new Error("alvo sumiu");
      const dx = t.x - this.position.x;
      const dz = t.z - this.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < within) return;
      const k = Math.min(step, dist - within * 0.5) / dist;
      this.position = { x: this.position.x + dx * k, y: 0, z: this.position.z + dz * k };
      this.socket.emit("state", {
        position: this.position,
        rotationY: Math.atan2(dx, dz),
        velocity: { x: 0, y: 0, z: 0 },
        anim: "run",
      });
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error("não chegou ao alvo");
  }

  /** Animal mais próximo do tipo pedido. */
  nearest(type: AnimalType): AnimalSnapshot {
    const dist = (a: AnimalSnapshot) => Math.hypot(a.position.x - this.position.x, a.position.z - this.position.z);
    const best = this.animals.filter((a) => this.types.get(a.id) === type).sort((a, b) => dist(a) - dist(b))[0];
    if (!best) throw new Error(`nenhum animal do tipo ${type}`);
    return best;
  }
}

test.beforeEach(async () => {
  await waitForEmptyRoom();
});

test("entra com nome e cor e vê o mundo", async ({ browser }) => {
  const page = await joinAs(browser, "Ana", 0);
  await expect(page.locator("canvas")).toBeVisible();
  await expect(page.locator(".name-label", { hasText: "Ana" })).toBeVisible();
  await expect(page.getByTestId("online-count")).toHaveText(`1/${MAX_PLAYERS} online`);

  // Nasce na praça, entre a fonte e os bancos, de frente para a fonte.
  const spawn = await page.evaluate(() => {
    const api = window.__jogo!;
    const { x: fx, z: fz } = api.square()!.fountain;
    const me = api.local();
    const toFountain = Math.atan2(fx - me.x, fz - me.z);
    return {
      distance: Math.hypot(me.x - fx, me.z - fz),
      turn: Math.abs(Math.atan2(Math.sin(toFountain - me.rotationY), Math.cos(toFountain - me.rotationY))),
    };
  });
  expect(spawn.distance).toBeGreaterThan(SPAWN_MIN_DISTANCE - 0.1);
  expect(spawn.distance).toBeLessThan(SPAWN_MAX_DISTANCE + 0.1);
  expect(spawn.turn).toBeLessThan(0.05);
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
  await expect.poll(() => hudCount(page, "fish")).toBe(0);

  await walkToFountain(page);
  await expect(action).toContainText("Pescar");

  // Ação na frente da fonte: abre o minigame com a vara na mão (sem soco).
  await page.keyboard.press("KeyF");
  await expect(panel).toBeVisible();
  await expect(action).toContainText("Fisgar");
  await expect.poll(async () => (await page.evaluate(() => window.__jogo!.local())).anim).toBe("fish");
  const firstSpeed = (await fishing()).speed;

  await hookOneFish(page);
  await expect.poll(() => hudCount(page, "fish")).toBe(1);

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
  await expect.poll(() => hudCount(page, "fish")).toBe(1);
  await closeAll([page]);
});

test("dar peixe: gatos e cachorros aceitam e passam a seguir, cavalos não comem", async () => {
  const bot = await FishBot.join("Tratador", PLAYER_COLORS[5], 2);
  try {
    // Cavalo não come peixe: nada é descontado.
    const horse = bot.nearest("horse");
    await bot.walkTo(() => bot.animal(horse.id)?.position, 1.5);
    bot.socket.emit("feedAnimal", { animalId: horse.id });
    await new Promise((r) => setTimeout(r, 800));
    expect(bot.fishCounts).toEqual([]);
    expect(bot.animal(horse.id)?.followingId).toBeNull();

    // Gato (o cachorro é testado pelo botão de Ação): desconta um peixe, todos recebem `animalFed` e ele segue o bot.
    const pet = bot.nearest("cat");
    await bot.walkTo(() => bot.animal(pet.id)?.position, 1.5);
    bot.socket.emit("feedAnimal", { animalId: pet.id });
    await expect.poll(() => bot.fishCounts).toEqual([1]);
    expect(bot.fedAnimals).toEqual([pet.id]);
    await expect.poll(() => bot.animal(pet.id)?.followingId).toBe(bot.id);

    // Anda para longe: o animal vem atrás e para perto.
    const goal = { x: bot.position.x * 0.5, z: bot.position.z * 0.5 + 12 };
    await bot.walkTo(() => goal, 0.5);
    await expect
      .poll(
        () => {
          const p = bot.animal(pet.id)?.position;
          return p ? Math.hypot(p.x - bot.position.x, p.z - bot.position.z) : Infinity;
        },
        { timeout: 10_000 },
      )
      .toBeLessThan(ANIMAL_FOLLOW_DISTANCE + 0.5);

    // Já segue o bot: um segundo peixe para ele é recusado (não gasta o peixe).
    bot.socket.emit("feedAnimal", { animalId: pet.id });
    await new Promise((r) => setTimeout(r, 800));
    expect(bot.fishCounts).toEqual([1]);
  } finally {
    bot.socket.disconnect();
  }
});

test("dar peixe pelo botão de Ação: só com peixe no inventário, mostra coração e o animal segue", async ({
  browser,
}) => {
  const page = await joinAs(browser, "Pescador", 3);
  const action = page.getByTestId("action-label");
  await walkToFountain(page);
  await page.keyboard.press("KeyF");
  await hookOneFish(page);
  await expect.poll(() => hudCount(page, "fish")).toBe(1);
  await page.keyboard.press("KeyQ");
  const me = await page.evaluate(() => window.__jogo!.local());
  const selfId = await page.evaluate(() => window.__jogo!.selfId());

  // Um bot atrai um cachorro até o pescador e sai (aí o cachorro para de segui-lo).
  const bot = await FishBot.join("Isca", PLAYER_COLORS[6], 1);
  const dog = bot.nearest("dog");
  try {
    await bot.walkTo(() => bot.animal(dog.id)?.position, 1.5);
    bot.socket.emit("feedAnimal", { animalId: dog.id });
    await expect.poll(() => bot.animal(dog.id)?.followingId).toBe(bot.id);
    await bot.walkTo(() => ({ x: me.x + 3, z: me.z + 3 }), 0.5);
    await expect
      .poll(() => {
        const p = bot.animal(dog.id)?.position;
        return p ? Math.hypot(p.x - bot.position.x, p.z - bot.position.z) : Infinity;
      }, { timeout: 15_000 })
      .toBeLessThan(ANIMAL_FOLLOW_DISTANCE + 0.5);
  } finally {
    bot.socket.disconnect();
  }

  // O pescador vai até o cachorro: de frente para ele, a Ação vira "Dar peixe".
  await page.keyboard.down("KeyW");
  await expect
    .poll(
      () =>
        page.evaluate((id) => {
          const api = window.__jogo!;
          const target = api.animals().find((a) => a.id === id);
          if (!target) return false;
          const p = api.local();
          api.lookAt(target.x, target.z);
          return Math.hypot(target.x - p.x, target.z - p.z) < 1.3 && api.fishing().label === "Dar peixe";
        }, dog.id),
      { intervals: [50], timeout: 15_000 },
    )
    .toBe(true);
  await page.keyboard.up("KeyW");
  await expect(action).toContainText("Dar peixe");

  // Dá o peixe: o inventário zera, o coração surge e o cachorro passa a segui-lo.
  await page.keyboard.press("KeyF");
  await expect.poll(() => hudCount(page, "fish")).toBe(0);
  await expect(page.locator(".reaction-bubble--active", { hasText: "❤️" })).toHaveCount(1);
  await expect
    .poll(() => page.evaluate((id) => window.__jogo!.animals().find((a) => a.id === id)?.followingId, dog.id))
    .toBe(selfId);

  // Sem peixe, a Ação volta a ser Bater.
  await expect(action).toContainText("Bater");
  await closeAll([page]);
});

/** Ponto de onde o cliente negocia: à frente da mesa, do lado oposto ao comerciante. */
function customerSpot(m: { x: number; z: number; table: { x: number; z: number } }): { x: number; z: number } {
  const dx = m.table.x - m.x;
  const dz = m.table.z - m.z;
  const d = Math.hypot(dx, dz);
  return { x: m.table.x + (dx / d) * 1.2, z: m.table.z + (dz / d) * 1.2 };
}

/**
 * De perto da praça até `spot`, fora dela: entra num anel em volta da fonte, contorna até o
 * ângulo de `toward` e segue reto pelo vão entre os bancos (onde ficam o comerciante e a barraca).
 */
async function walkAroundFountainTo(page: Page, toward: { x: number; z: number }, spot: { x: number; z: number }): Promise<void> {
  const square = await page.evaluate(() => window.__jogo!.square()!);
  const { x: fx, z: fz } = square.fountain;
  const ring = 5;
  const at = (angle: number) => [fx + Math.sin(angle) * ring, fz + Math.cos(angle) * ring] as const;
  const me = await page.evaluate(() => window.__jogo!.local());
  let angle = Math.atan2(me.x - fx, me.z - fz);
  const target = Math.atan2(toward.x - fx, toward.z - fz);
  await walkTo(page, ...at(angle), 0.8);
  let diff = Math.atan2(Math.sin(target - angle), Math.cos(target - angle));
  while (Math.abs(diff) > 0.05) {
    const step = Math.sign(diff) * Math.min(Math.abs(diff), 0.5);
    angle += step;
    diff -= step;
    await walkTo(page, ...at(angle), 0.8);
  }
  await walkTo(page, spot.x, spot.z, 0.4);
}

/** Da fonte até a mesa do comerciante. */
async function walkFromFountainToMerchant(page: Page): Promise<void> {
  const merchant = await page.evaluate(() => window.__jogo!.merchant()!);
  await walkAroundFountainTo(page, merchant, customerSpot(merchant));
}

test("comerciante compra e vende peixe, com estoque e validação no servidor", async () => {
  const fishPrice = ITEMS.fish.price;
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const bot = await FishBot.join("Freguês", PLAYER_COLORS[2], 2, 0);
  try {
    const merchant = bot.merchant!;
    expect(merchant.signText).toBe(MERCHANT_SIGN_TEXT);
    const startStock = merchant.stock.fish;

    // Longe da mesa: recusado.
    bot.socket.emit("trade", { item: "fish", action: "sell" });
    await wait(500);
    expect(bot.moneys).toEqual([]);

    const spot = customerSpot({ ...merchant.position, table: merchant.table });
    await bot.walkTo(() => spot, 0.3);
    const dist = Math.hypot(bot.position.x - merchant.table.x, bot.position.z - merchant.table.z);
    expect(dist).toBeLessThan(MERCHANT_TRADE_RANGE);

    // Sem dinheiro não compra; item desconhecido é ignorado.
    bot.socket.emit("trade", { item: "fish", action: "buy" });
    bot.socket.emit("trade", { item: "ouro", action: "buy" } as never);
    await wait(500);
    expect(bot.moneys).toEqual([]);

    // Vende um peixe: ganha o preço, perde o peixe e o estoque (de todos) sobe.
    bot.socket.emit("trade", { item: "fish", action: "sell" });
    await expect.poll(() => bot.moneys).toEqual([fishPrice.sell]);
    expect(bot.fishCounts).toEqual([1]);
    expect(bot.stocks.at(-1)?.fish).toBe(startStock + 1);

    // Compra de volta: paga o preço e o estoque desce.
    await wait(300);
    bot.socket.emit("trade", { item: "fish", action: "buy" });
    await expect.poll(() => bot.moneys).toEqual([fishPrice.sell, fishPrice.sell - fishPrice.buy]);
    expect(bot.fishCounts).toEqual([1, 2]);
    expect(bot.stocks.at(-1)?.fish).toBe(startStock);
  } finally {
    bot.socket.disconnect();
  }

  // O dinheiro volta no `join` (reconexão) e é validado.
  const rich = await FishBot.join("Rico", PLAYER_COLORS[3], 0, 7);
  const cheater = await FishBot.join("Trapaça", PLAYER_COLORS[4], 0, -5);
  expect(rich.initialMoney).toBe(7);
  expect(cheater.initialMoney).toBe(0);
  rich.socket.disconnect();
  cheater.socket.disconnect();
});

test("comerciante pelo botão de Ação: Negociar abre o painel, vende e compra peixe", async ({ browser }) => {
  const page = await joinAs(browser, "Pescador", 7);
  const action = page.getByTestId("action-label");
  const panel = page.getByTestId("merchant-panel");
  await expect(page.getByTestId("money")).toHaveText("💰 R$ 0");

  await walkToFountain(page);
  await page.keyboard.press("KeyF");
  await hookOneFish(page);
  await expect.poll(() => hudCount(page, "fish")).toBe(1);
  await page.keyboard.press("KeyQ");

  await walkFromFountainToMerchant(page);
  await expect(action).toContainText("Negociar");
  await page.keyboard.press("KeyF");
  await expect(panel).toBeVisible();
  await expect(action).toContainText("Fechar");
  const stock = (await page.evaluate(() => window.__jogo!.merchant()!)).stock.fish ?? 0;
  await expect(page.getByTestId("merchant-stock-fish")).toHaveText(`Estoque: ${stock}`);
  await expect(page.getByTestId("merchant-buy-fish")).toBeDisabled();

  // Vende o peixe: o dinheiro sobe, o peixe sai e o comerciante comemora.
  await page.getByTestId("merchant-sell-fish").click();
  await expect(page.getByTestId("money")).toHaveText("💰 R$ 1");
  await expect.poll(() => hudCount(page, "fish")).toBe(0);
  await expect(page.getByTestId("merchant-stock-fish")).toHaveText(`Estoque: ${stock + 1}`);
  await expect(page.getByTestId("merchant-wallet")).toContainText("R$ 1");
  await expect(page.locator(".reaction-bubble--active", { hasText: "💰" })).toHaveCount(1);
  await expect(page.getByTestId("merchant-sell-fish")).toBeDisabled();

  // Compra de volta.
  await page.getByTestId("merchant-buy-fish").click();
  await expect(page.getByTestId("money")).toHaveText("💰 R$ 0");
  await expect.poll(() => hudCount(page, "fish")).toBe(1);
  await expect(page.getByTestId("merchant-stock-fish")).toHaveText(`Estoque: ${stock}`);

  // Q fecha o painel.
  await page.keyboard.press("KeyQ");
  await expect(panel).toBeHidden();
  await expect(action).toContainText("Negociar");
  await closeAll([page]);
});

/** Da praça até o balcão da Deendi. */
async function walkToClothingShop(page: Page): Promise<void> {
  const shop = await page.evaluate(() => window.__jogo!.clothing()!);
  await walkAroundFountainTo(page, shop, customerSpot({ ...shop, table: shop.counter }));
  // Pode chegar de lado (contornando a placa): vira para o balcão com um toque em W.
  await page.evaluate(([x, z]) => window.__jogo!.lookAt(x, z), [shop.counter.x, shop.counter.z] as const);
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(80);
  await page.keyboard.up("KeyW");
}

test("loja de roupas: compra e veste, troca na mesma parte do corpo, tudo validado no servidor", async () => {
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const gap = OUTFIT_BUY_COOLDOWN_MS + 50;
  const { topHat, cap, glasses, boots } = OUTFIT_ITEMS;
  // Dá para as quatro compras, mas depois não sobra para a cartola de novo.
  const start = topHat.price + glasses.price + boots.price + cap.price + 10;
  const bot = await FishBot.join("Vaidoso", PLAYER_COLORS[8], 0, start);
  const watcher = await FishBot.join("Olheiro", PLAYER_COLORS[9], 0, 0);
  try {
    const shop = bot.clothingShop!;
    expect(shop.sellerName).toBe(CLOTHING_SELLER_NAME);
    expect(shop.signText).toBe(CLOTHING_SIGN_TEXT);
    expect(shop.appearance.outfit).toEqual({ head: "topHat", eyes: "glasses", feet: "boots" });
    expect(bot.initialOutfit).toEqual({});

    // Longe do balcão: recusado.
    bot.socket.emit("buyOutfit", { item: "topHat" });
    await wait(gap);
    expect(bot.moneys).toEqual([]);

    await bot.walkTo(() => customerSpot({ ...shop.position, table: shop.counter }), 0.3);
    expect(Math.hypot(bot.position.x - shop.counter.x, bot.position.z - shop.counter.z)).toBeLessThan(CLOTHING_SHOP_RANGE);

    // Item desconhecido é ignorado.
    bot.socket.emit("buyOutfit", { item: "coroa" } as never);
    await wait(gap);
    expect(bot.moneys).toEqual([]);

    // Cartola, óculos e bota ao mesmo tempo: cada um numa parte do corpo.
    let money = start;
    const expected: Outfit = {};
    for (const [id, slot] of [["topHat", "head"], ["glasses", "eyes"], ["boots", "feet"]] as const) {
      bot.socket.emit("buyOutfit", { item: id });
      money -= OUTFIT_ITEMS[id].price;
      expected[slot] = id;
      await expect.poll(() => bot.moneys.at(-1)).toBe(money);
      expect(bot.outfits.at(-1)).toEqual(expected);
      await wait(gap);
    }
    expect(bot.outfitSales).toEqual([bot.id, bot.id, bot.id]);
    // Todos veem as roupas no snapshot.
    await expect.poll(() => watcher.players.find((p) => p.id === bot.id)?.outfit).toEqual(expected);

    // Comprar de novo o que já veste não cobra.
    bot.socket.emit("buyOutfit", { item: "topHat" });
    await wait(gap);
    expect(bot.moneys.at(-1)).toBe(money);

    // Boné e cartola não vão juntos: o boné troca a cartola.
    bot.socket.emit("buyOutfit", { item: "cap" });
    money -= cap.price;
    await expect.poll(() => bot.moneys.at(-1)).toBe(money);
    expect(bot.outfits.at(-1)).toEqual({ head: "cap", eyes: "glasses", feet: "boots" });
    await wait(gap);

    // Sem dinheiro para a cartola: recusado.
    expect(money).toBeLessThan(topHat.price);
    bot.socket.emit("buyOutfit", { item: "topHat" });
    await wait(gap);
    expect(bot.moneys.at(-1)).toBe(money);
    expect(bot.outfits.at(-1)?.head).toBe("cap");
  } finally {
    bot.socket.disconnect();
    watcher.socket.disconnect();
  }

  // As roupas voltam no `join` (reconexão) e são validadas: item da parte errada ou desconhecido sai.
  const back = await FishBot.join("Voltou", PLAYER_COLORS[8], 0, 0, { head: "cap", eyes: "topHat", feet: "boots", hands: "luva" });
  expect(back.initialOutfit).toEqual({ head: "cap", feet: "boots" });
  back.socket.disconnect();
});

test("loja de roupas pelo botão de Ação: abre o painel da Deendi e vê as roupas dos outros", async ({ browser }) => {
  const page = await joinAs(browser, "Curioso", 1);
  const action = page.getByTestId("action-label");
  const panel = page.getByTestId("clothing-panel");
  const bot = await FishBot.join("Elegante", PLAYER_COLORS[3], 0, OUTFIT_ITEMS.topHat.price);
  try {
    await walkToClothingShop(page);
    await expect(action).toContainText("Comprar roupas");
    await page.keyboard.press("KeyF");
    await expect(panel).toBeVisible();
    await expect(action).toContainText("Fechar");
    await expect(panel).toContainText(CLOTHING_SELLER_NAME);
    await expect(page.getByTestId("clothing-wallet")).toContainText("Vestindo: nada");
    // Sem dinheiro: os botões mostram o preço, mas ficam desabilitados.
    await expect(page.getByTestId("clothing-buy-topHat")).toHaveText(`Comprar R$ ${OUTFIT_ITEMS.topHat.price}`);
    await expect(page.getByTestId("clothing-buy-topHat")).toBeDisabled();
    await expect(page.getByTestId("clothing-buy-boots")).toBeDisabled();

    // Outro jogador compra uma cartola: a Deendi comemora e todos o veem com ela.
    const shop = bot.clothingShop!;
    await bot.walkTo(() => customerSpot({ ...shop.position, table: shop.counter }), 0.3);
    bot.socket.emit("buyOutfit", { item: "topHat" });
    await expect.poll(() => bot.outfits.at(-1)).toEqual({ head: "topHat" });
    await expect
      .poll(() => page.evaluate((id) => window.__jogo!.remotes().find((r) => r.id === id)?.outfit, bot.id))
      .toEqual({ head: "topHat" });
    await expect(page.locator(".reaction-bubble--active", { hasText: "🛍️" })).toHaveCount(1);

    // Q fecha o painel.
    await page.keyboard.press("KeyQ");
    await expect(panel).toBeHidden();
    await expect(action).toContainText("Comprar roupas");
  } finally {
    bot.socket.disconnect();
    await closeAll([page]);
  }
});

/** Da praça até a bancada do Gabriel. */
async function walkToToolShop(page: Page): Promise<void> {
  const shop = await page.evaluate(() => window.__jogo!.tools()!);
  await walkAroundFountainTo(page, shop, customerSpot({ ...shop, table: shop.counter }));
  await page.evaluate(([x, z]) => window.__jogo!.lookAt(x, z), [shop.counter.x, shop.counter.z] as const);
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(80);
  await page.keyboard.up("KeyW");
}

test("loja de ferramentas: compra machado, inventário de até 2 ferramentas, tudo validado no servidor", async () => {
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const gap = TOOL_BUY_COOLDOWN_MS + 50;
  const price = TOOL_ITEMS.axe.price;
  // Dá para comprar mais de MAX_TOOLS machados: o limite é o inventário, não o dinheiro.
  const start = price * (MAX_TOOLS + 1);
  const bot = await FishBot.join("Lenhador", PLAYER_COLORS[8], 0, start);
  const watcher = await FishBot.join("Vizinho", PLAYER_COLORS[9], 0, 0);
  try {
    const shop = bot.toolShop!;
    expect(shop.sellerName).toBe(TOOL_SELLER_NAME);
    expect(shop.signText).toBe(TOOL_SIGN_TEXT);
    expect(bot.initialInventory).toEqual({});
    // Cada barraca no seu lugar: a do Gabriel não fica em cima das outras.
    for (const other of [bot.merchant!.position, bot.clothingShop!.position, bot.shootingBooth!.position]) {
      expect(Math.hypot(other.x - shop.position.x, other.z - shop.position.z)).toBeGreaterThan(4);
    }

    // Longe da bancada: recusado.
    bot.socket.emit("buyTool", { item: "axe" });
    await wait(gap);
    expect(bot.moneys).toEqual([]);

    await bot.walkTo(() => customerSpot({ ...shop.position, table: shop.counter }), 0.3);
    expect(Math.hypot(bot.position.x - shop.counter.x, bot.position.z - shop.counter.z)).toBeLessThan(TOOL_SHOP_RANGE);

    // Ferramenta desconhecida é ignorada.
    bot.socket.emit("buyTool", { item: "motosserra" } as never);
    await wait(gap);
    expect(bot.moneys).toEqual([]);

    // Compra até o limite de ferramentas.
    let money = start;
    for (let i = 1; i <= MAX_TOOLS; i++) {
      bot.socket.emit("buyTool", { item: "axe" });
      money -= price;
      await expect.poll(() => bot.moneys.at(-1)).toBe(money);
      expect(bot.inventories.at(-1)).toEqual({ axe: i });
      await wait(gap);
    }
    expect(bot.toolSales).toEqual(Array(MAX_TOOLS).fill(bot.id));
    // Todos veem o inventário no snapshot.
    await expect.poll(() => watcher.players.find((p) => p.id === bot.id)?.inventory).toEqual({ axe: MAX_TOOLS });

    // Limite de ferramentas: recusado mesmo com dinheiro.
    expect(money).toBeGreaterThanOrEqual(price);
    bot.socket.emit("buyTool", { item: "axe" });
    await wait(gap);
    expect(bot.moneys.at(-1)).toBe(money);
    expect(bot.inventories).toHaveLength(MAX_TOOLS);

    // Sem dinheiro: recusado.
    await watcher.walkTo(() => customerSpot({ ...shop.position, table: shop.counter }), 0.3);
    watcher.socket.emit("buyTool", { item: "axe" });
    await wait(gap);
    expect(watcher.moneys).toEqual([]);
  } finally {
    bot.socket.disconnect();
    watcher.socket.disconnect();
  }

  // O inventário volta no `join` (reconexão), validado: só itens do catálogo, quantidades inteiras,
  // no máximo MAX_TOOLS ferramentas e só o que couber nos espaços.
  const back = await FishBot.join("Voltou", PLAYER_COLORS[8], 15, 0, undefined, { axe: 5, serrote: 1, wood: 2.5 });
  expect(back.initialInventory).toEqual({ fish: 15, axe: MAX_TOOLS });
  back.socket.disconnect();
  const hoarder = await FishBot.join("Acumulador", PLAYER_COLORS[8], 0, 0, undefined, { wood: 999 });
  expect(hoarder.initialInventory).toEqual({ wood: INVENTORY_SLOTS * INVENTORY_ITEMS.wood.stack });
  hoarder.socket.disconnect();
});

test("loja de ferramentas pelo botão de Ação: abre o painel do Gabriel e o HUD mostra o inventário", async ({ browser }) => {
  const page = await joinAs(browser, "Curioso", 1);
  const action = page.getByTestId("action-label");
  const panel = page.getByTestId("tools-panel");
  const bot = await FishBot.join("Freguês", PLAYER_COLORS[3], 0, TOOL_ITEMS.axe.price);
  try {
    expect(await hudCount(page, "axe")).toBe(0);
    await walkToToolShop(page);
    await expect(action).toContainText("Comprar ferramentas");
    await page.keyboard.press("KeyF");
    await expect(panel).toBeVisible();
    await expect(action).toContainText("Fechar");
    await expect(panel).toContainText(TOOL_SELLER_NAME);
    await expect(page.getByTestId("tools-wallet")).toContainText(`(0/${MAX_TOOLS})`);
    // Sem dinheiro: o botão mostra o preço, mas fica desabilitado.
    await expect(page.getByTestId("tools-buy-axe")).toHaveText(`Comprar R$ ${TOOL_ITEMS.axe.price}`);
    await expect(page.getByTestId("tools-buy-axe")).toBeDisabled();

    // Outro jogador compra um machado: o Gabriel comemora para todos.
    const shop = bot.toolShop!;
    await bot.walkTo(() => customerSpot({ ...shop.position, table: shop.counter }), 0.3);
    bot.socket.emit("buyTool", { item: "axe" });
    await expect.poll(() => bot.axeCounts.at(-1)).toBe(1);
    await expect(page.locator(".reaction-bubble--active", { hasText: "🔨" })).toHaveCount(1);

    // Q fecha o painel.
    await page.keyboard.press("KeyQ");
    await expect(panel).toBeHidden();
    await expect(action).toContainText("Comprar ferramentas");

    // Volta (reconexão) com dinheiro, mas com o inventário cheio: não dá para comprar o machado.
    const full = { fish: INVENTORY_SLOTS * STACK };
    await page.evaluate((inventory) => window.__jogo!.rejoin({ money: 100, inventory }), full);
    await expect.poll(() => hudCount(page, "fish")).toBe(full.fish);
    await expect(page.getByTestId("inventory")).toHaveClass(/hud-inventory--full/);
    await expect(action).toContainText("Comprar ferramentas");
    await page.keyboard.press("KeyF");
    await expect(page.getByTestId("tools-buy-axe")).toBeDisabled();
    await expect(page.getByTestId("tools-status-axe")).toHaveText("🎒 Inventário cheio");
  } finally {
    bot.socket.disconnect();
    await closeAll([page]);
  }
});

/** Árvore em pé mais perto de (x, z). */
function nearestStanding(trees: { id: string; x: number; z: number; chopped: boolean }[], x: number, z: number) {
  const standing = trees.filter((t) => !t.chopped).sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z));
  const tree = standing[0];
  if (!tree) throw new Error("nenhuma árvore em pé");
  return tree;
}

/** Leva o jogador para perto da árvore (do lado do centro do mapa) e o vira para o tronco. */
async function goToTree(page: Page, tree: { x: number; z: number }): Promise<void> {
  const me = await page.evaluate(() => window.__jogo!.local());
  const d = Math.hypot(tree.x, tree.z);
  const spot = { x: tree.x - (tree.x / d) * 4, z: tree.z - (tree.z / d) * 4 };
  await page.evaluate(([x, z]) => window.__jogo!.teleport(x, z), [spot.x, spot.z] as const);
  // O servidor aceita a posição nova aos poucos (limite de velocidade): dá tempo para ele alcançar.
  await page.waitForTimeout(Math.hypot(spot.x - me.x, spot.z - me.z) * 50 + 500);
  await walkTo(page, tree.x, tree.z, 1.4);
  await page.evaluate(([x, z]) => window.__jogo!.lookAt(x, z), [tree.x, tree.z] as const);
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(60);
  await page.keyboard.up("KeyW");
}

test("cortar árvore: precisa de machado e espaço, vira toco para todos e a madeira vai para o inventário", async () => {
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const lumberjack = await FishBot.join("Lenhador", PLAYER_COLORS[5], 0, 0, undefined, { axe: 1 });
  const noAxe = await FishBot.join("Sem Machado", PLAYER_COLORS[6], 0, 0);
  let choppedId = "";
  try {
    expect(lumberjack.trees).toHaveLength(TREE_COUNT);
    // O servidor pode estar rodando desde outros testes: escolhe uma árvore ainda em pé.
    const tree = lumberjack.trees.find((t) => !t.chopped)!;
    choppedId = tree.id;

    // Longe da árvore: recusado.
    lumberjack.socket.emit("chopTree", { treeId: tree.id });
    // Sem machado: recusado.
    await noAxe.walkTo(() => tree.position, 1.2);
    noAxe.socket.emit("chopTree", { treeId: tree.id });
    // Árvore que não existe: ignorado.
    lumberjack.socket.emit("chopTree", { treeId: "carvalho-fantasma" });
    await wait(500);
    expect(lumberjack.inventories).toEqual([]);
    expect(noAxe.inventories).toEqual([]);

    // Com machado, perto da árvore: a madeira vai para o inventário e todos veem o toco.
    await lumberjack.walkTo(() => tree.position, 1.2);
    lumberjack.socket.emit("chopTree", { treeId: tree.id });
    await expect.poll(() => lumberjack.inventories.at(-1)).toEqual({ axe: 1, wood: WOOD_PER_TREE });
    await expect.poll(() => noAxe.choppedTrees).toEqual([tree.id]);
    expect(lumberjack.choppedTrees).toEqual([tree.id]);

    // O toco não dá madeira de novo.
    await wait(CHOP_COOLDOWN_MS + 100);
    lumberjack.socket.emit("chopTree", { treeId: tree.id });
    await wait(500);
    expect(lumberjack.inventories).toHaveLength(1);
  } finally {
    lumberjack.socket.disconnect();
    noAxe.socket.disconnect();
  }

  // Quem chega depois já recebe o toco no `welcome`.
  const late = await FishBot.join("Atrasado", PLAYER_COLORS[5], 0, 0);
  expect(late.trees.find((t) => t.id === choppedId)?.chopped).toBe(true);
  late.socket.disconnect();
});

test("inventário cheio: não pesca, não corta e não compra peixe nem machado; vender abre espaço", async () => {
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  // Pilhas de peixe completas em todos os espaços menos um, e o machado no último: inventário cheio.
  const fish = (INVENTORY_SLOTS - 1) * STACK;
  const bot = await FishBot.join("Abarrotado", PLAYER_COLORS[7], fish, 100, undefined, { axe: 1 });
  try {
    expect(bot.initialInventory).toEqual({ fish, axe: 1 });

    // Árvore: sem espaço para a madeira.
    const tree = bot.trees.find((t) => !t.chopped)!;
    await bot.walkTo(() => tree.position, 1.2);
    bot.socket.emit("chopTree", { treeId: tree.id });
    // Gabriel: sem espaço para outro machado.
    const shop = bot.toolShop!;
    await bot.walkTo(() => customerSpot({ ...shop.position, table: shop.counter }), 0.3);
    bot.socket.emit("buyTool", { item: "axe" });
    // Fonte: sem espaço para mais peixe.
    await bot.walkTo(() => bot.fountain, 2.5);
    bot.socket.emit("fishCaught", {});
    await wait(500);
    expect(bot.inventories).toEqual([]);
    expect(bot.moneys).toEqual([]);

    // Comerciante: comprar peixe é recusado; vender um peixe abre espaço numa pilha e aí a compra passa.
    const merchant = bot.merchant!;
    await bot.walkTo(() => customerSpot({ ...merchant.position, table: merchant.table }), 0.3);
    bot.socket.emit("trade", { item: "fish", action: "buy" });
    await wait(500);
    expect(bot.inventories).toEqual([]);
    bot.socket.emit("trade", { item: "fish", action: "sell" });
    await expect.poll(() => bot.fishCounts).toEqual([fish - 1]);
    await wait(300);
    bot.socket.emit("trade", { item: "fish", action: "buy" });
    await expect.poll(() => bot.fishCounts).toEqual([fish - 1, fish]);
  } finally {
    bot.socket.disconnect();
  }
});

test("cortar árvore pelo botão de Ação: com machado, golpes derrubam a árvore; inventário cheio avisa", async ({ browser }) => {
  const page = await joinAs(browser, "Lenhadora", 2);
  const action = page.getByTestId("action-label");
  const panel = page.getByTestId("chopping-panel");
  const chopping = () => page.evaluate(() => window.__jogo!.chopping());

  // Sem machado, de frente para a árvore, a Ação continua sendo Bater.
  const me = await page.evaluate(() => window.__jogo!.local());
  const tree = nearestStanding(await page.evaluate(() => window.__jogo!.trees()), me.x, me.z);
  await goToTree(page, tree);
  await expect(action).toContainText("Bater");

  // Volta (reconexão) com um machado: a Ação vira Cortar árvore.
  await page.evaluate(() => window.__jogo!.rejoin({ inventory: { axe: 1 } }));
  await expect.poll(() => hudCount(page, "axe")).toBe(1);
  await expect(action).toContainText("Cortar árvore");
  await page.keyboard.press("KeyF");
  await expect(panel).toBeVisible();
  await expect(action).toContainText("Golpear");
  await expect.poll(async () => (await page.evaluate(() => window.__jogo!.local())).anim).toBe("chop");

  // Golpeia na área certa até derrubar.
  for (let i = 0; i < 6 && !(await page.evaluate((id) => window.__jogo!.trees().find((t) => t.id === id)?.chopped, tree.id)); i++) {
    await page.waitForFunction(
      () => {
        const c = window.__jogo!.chopping();
        const margin = (c.zoneEnd - c.zoneStart) * 0.25;
        return c.phase === "playing" && c.marker > c.zoneStart + margin && c.marker < c.zoneEnd - margin;
      },
      undefined,
      { timeout: 10_000, polling: "raf" },
    );
    await page.keyboard.press("KeyF");
    await expect.poll(async () => (await chopping()).phase).not.toBe("playing");
    if ((await chopping()).phase === "felled") break;
  }
  await expect
    .poll(() => page.evaluate((id) => window.__jogo!.trees().find((t) => t.id === id)?.chopped, tree.id))
    .toBe(true);
  await expect.poll(() => hudCount(page, "wood")).toBe(WOOD_PER_TREE);
  expect(await page.evaluate(() => window.__jogo!.inventory())).toEqual({ axe: 1, wood: WOOD_PER_TREE });
  // O minigame fecha sozinho e o toco não dá para cortar.
  await expect(panel).toBeHidden({ timeout: 5_000 });
  await expect(action).not.toContainText("Cortar árvore");

  // Com o inventário cheio (madeira inclusive), cortar outra árvore só mostra o aviso.
  const full = { fish: (INVENTORY_SLOTS - 2) * STACK, wood: INVENTORY_ITEMS.wood.stack, axe: 1 };
  await page.evaluate((inventory) => window.__jogo!.rejoin({ inventory }), full);
  await expect.poll(() => page.evaluate(() => window.__jogo!.inventory())).toEqual(full);
  await expect(page.getByTestId("inventory")).toHaveClass(/hud-inventory--full/);
  const here = await page.evaluate(() => window.__jogo!.local());
  const other = nearestStanding(await page.evaluate(() => window.__jogo!.trees()), here.x, here.z);
  await goToTree(page, other);
  await expect(action).toContainText("Cortar árvore");
  await page.keyboard.press("KeyF");
  await expect(page.getByTestId("hud-notice")).toHaveText("🎒 Inventário cheio!");
  await expect(panel).toBeHidden();
  await closeAll([page]);
});

test("madeireira: o Brenno compra madeira, tudo validado no servidor", async () => {
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const gap = WOOD_SELL_COOLDOWN_MS + 50;
  const bot = await FishBot.join("Lenhador", PLAYER_COLORS[8], 0, 0, undefined, { wood: 5, axe: 1 });
  const watcher = await FishBot.join("Vizinho", PLAYER_COLORS[9], 0, 0);
  try {
    const mill = bot.lumberMill!;
    expect(mill.buyerName).toBe(LUMBER_BUYER_NAME);
    expect(mill.signText).toBe(LUMBER_SIGN_TEXT);
    expect(mill.woodPrice).toBe(WOOD_SELL_PRICE);
    // O Brenno tem bigode.
    expect(mill.appearance.mustacheColor).toBeTruthy();
    // Cada barraca no seu lugar: a madeireira não fica em cima das outras.
    for (const other of [bot.merchant!.position, bot.clothingShop!.position, bot.shootingBooth!.position, bot.toolShop!.position]) {
      expect(Math.hypot(other.x - mill.position.x, other.z - mill.position.z)).toBeGreaterThan(4);
    }

    // Longe do balcão: recusado.
    bot.socket.emit("sellWood", { amount: 1 });
    await wait(gap);
    expect(bot.moneys).toEqual([]);

    await bot.walkTo(() => customerSpot({ ...mill.position, table: mill.counter }), 0.3);

    // Quantidades inválidas ou maiores que a madeira que tem: recusado.
    for (const amount of [0, -1, 2.5, "3", 6]) {
      bot.socket.emit("sellWood", { amount } as never);
      await wait(gap);
    }
    expect(bot.moneys).toEqual([]);

    // Vende uma: recebe o preço, a madeira sai do inventário e todos veem o Brenno comemorar.
    bot.socket.emit("sellWood", { amount: 1 });
    await expect.poll(() => bot.moneys).toEqual([WOOD_SELL_PRICE]);
    expect(bot.inventories.at(-1)).toEqual({ wood: 4, axe: 1 });
    await expect.poll(() => watcher.woodSales).toEqual([bot.id]);

    // Vende o resto de uma vez.
    await wait(gap);
    bot.socket.emit("sellWood", { amount: 4 });
    await expect.poll(() => bot.moneys.at(-1)).toBe(5 * WOOD_SELL_PRICE);
    expect(bot.inventories.at(-1)).toEqual({ axe: 1 });

    // Sem madeira: recusado.
    await wait(gap);
    bot.socket.emit("sellWood", { amount: 1 });
    await wait(gap);
    expect(bot.moneys).toHaveLength(2);
  } finally {
    bot.socket.disconnect();
    watcher.socket.disconnect();
  }
});

/** Da praça até o balcão do Brenno. */
async function walkToLumberMill(page: Page): Promise<void> {
  const mill = await page.evaluate(() => window.__jogo!.lumber()!);
  await walkAroundFountainTo(page, mill, customerSpot({ ...mill, table: mill.counter }));
  await page.evaluate(([x, z]) => window.__jogo!.lookAt(x, z), [mill.counter.x, mill.counter.z] as const);
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(80);
  await page.keyboard.up("KeyW");
}

test("madeireira pelo botão de Ação: vende uma madeira e depois todas ao Brenno", async ({ browser }) => {
  const page = await joinAs(browser, "Lenhadora", 4);
  const action = page.getByTestId("action-label");
  const panel = page.getByTestId("lumber-panel");
  // Volta (reconexão) com madeira cortada.
  await page.evaluate(() => window.__jogo!.rejoin({ inventory: { wood: 3 } }));
  await expect.poll(() => hudCount(page, "wood")).toBe(3);

  await walkToLumberMill(page);
  await expect(action).toContainText("Vender madeira");
  await page.keyboard.press("KeyF");
  await expect(panel).toBeVisible();
  await expect(action).toContainText("Fechar");
  await expect(panel).toContainText(LUMBER_BUYER_NAME);
  await expect(page.getByTestId("lumber-wallet")).toContainText("🪵 3");
  await expect(page.getByTestId("lumber-sell-all")).toHaveText(`Vender tudo R$ ${3 * WOOD_SELL_PRICE}`);

  // Vende uma: o dinheiro sobe, a madeira desce e o Brenno comemora.
  await page.getByTestId("lumber-sell-one").click();
  await expect(page.getByTestId("money")).toHaveText(`💰 R$ ${WOOD_SELL_PRICE}`);
  await expect.poll(() => hudCount(page, "wood")).toBe(2);
  await expect(page.locator(".reaction-bubble--active", { hasText: "🪵" })).toHaveCount(1);

  // Vende o resto: sem madeira, os botões desabilitam e o painel explica como conseguir mais.
  await page.waitForTimeout(WOOD_SELL_COOLDOWN_MS + 50);
  await page.getByTestId("lumber-sell-all").click();
  await expect(page.getByTestId("money")).toHaveText(`💰 R$ ${3 * WOOD_SELL_PRICE}`);
  await expect.poll(() => hudCount(page, "wood")).toBe(0);
  await expect(page.getByTestId("lumber-sell-one")).toBeDisabled();
  await expect(page.getByTestId("lumber-sell-all")).toBeDisabled();
  await expect(page.getByTestId("lumber-hint")).toContainText("machado");

  // Q fecha o painel.
  await page.keyboard.press("KeyQ");
  await expect(panel).toBeHidden();
  await expect(action).toContainText("Vender madeira");
  await closeAll([page]);
});

/** Ponto de onde se joga o Tiro ao Alvo: à frente do balcão. */
function boothSpot(b: { x: number; z: number; rotationY: number }): { x: number; z: number } {
  return { x: b.x + Math.sin(b.rotationY) * 1.3, z: b.z + Math.cos(b.rotationY) * 1.3 };
}

test("Tiro ao Alvo: entrada, 5 patos seguidos dão o prêmio, errar encerra, tudo validado no servidor", async () => {
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const shotGap = SHOOTING_SHOT_COOLDOWN_MS + 50;
  const bot = await FishBot.join("Atirador", PLAYER_COLORS[5], 0, 2);
  const broke = await FishBot.join("Duro", PLAYER_COLORS[6], 0, 0);
  try {
    const booth = bot.shootingBooth!;
    expect(booth.ownerName).toBe(SHOOTING_OWNER_NAME);
    expect(booth.signText).toBe(SHOOTING_SIGN_TEXT);
    // O Balotinho fica atrás do balcão (do lado oposto aos clientes).
    const toOwner = { x: booth.ownerPosition.x - booth.position.x, z: booth.ownerPosition.z - booth.position.z };
    expect(toOwner.x * Math.sin(booth.rotationY) + toOwner.z * Math.cos(booth.rotationY)).toBeLessThan(0);

    // Longe do balcão: recusado.
    bot.socket.emit("shootingStart", {});
    await wait(500);
    expect(bot.shootingStates).toEqual([]);
    expect(bot.moneys).toEqual([]);

    const spot = boothSpot({ ...booth.position, rotationY: booth.rotationY });
    await Promise.all([bot.walkTo(() => spot, 0.3), broke.walkTo(() => spot, 0.3)]);
    expect(Math.hypot(bot.position.x - booth.position.x, bot.position.z - booth.position.z)).toBeLessThan(SHOOTING_PLAY_RANGE);

    // Sem dinheiro não joga.
    broke.socket.emit("shootingStart", {});
    // Paga a entrada e começa; pedir de novo no meio da partida não cobra outra vez.
    bot.socket.emit("shootingStart", {});
    await expect.poll(() => bot.shootingStates).toEqual([{ phase: "playing", hits: 0 }]);
    bot.socket.emit("shootingStart", {});
    expect(bot.moneys).toEqual([2 - SHOOTING_ENTRY_COST]);

    // Tiro inválido é ignorado; tiro rápido demais não conta, mas o placar volta.
    bot.socket.emit("shootingShot", { hit: "sim" } as never);
    bot.socket.emit("shootingShot", { hit: true });
    bot.socket.emit("shootingShot", { hit: true });
    await expect.poll(() => bot.shootingStates.slice(1)).toEqual([
      { phase: "playing", hits: 1 },
      { phase: "playing", hits: 1 },
    ]);

    // Acerta o resto em sequência: o último paga o prêmio e todos veem o resultado.
    for (let hits = 2; hits <= SHOOTING_TARGETS_TO_WIN; hits++) {
      await wait(shotGap);
      bot.socket.emit("shootingShot", { hit: true });
      const phase = hits === SHOOTING_TARGETS_TO_WIN ? "won" : "playing";
      await expect.poll(() => bot.shootingStates.at(-1)).toEqual({ phase, hits });
    }
    const afterWin = 2 - SHOOTING_ENTRY_COST + SHOOTING_PRIZE;
    expect(bot.moneys).toEqual([2 - SHOOTING_ENTRY_COST, afterWin]);
    await expect.poll(() => broke.shootingResults).toEqual([{ playerId: bot.id, won: true }]);

    // Nova partida: errar o primeiro tiro encerra sem prêmio.
    bot.socket.emit("shootingStart", {});
    await expect.poll(() => bot.moneys.at(-1)).toBe(afterWin - SHOOTING_ENTRY_COST);
    await wait(shotGap);
    bot.socket.emit("shootingShot", { hit: false });
    await expect.poll(() => bot.shootingStates.at(-1)).toEqual({ phase: "lost", hits: 0 });
    await expect.poll(() => broke.shootingResults.at(-1)).toEqual({ playerId: bot.id, won: false });

    // Sair no meio perde a entrada: depois disso, tiros são ignorados.
    bot.socket.emit("shootingStart", {});
    await expect.poll(() => bot.moneys.at(-1)).toBe(afterWin - 2 * SHOOTING_ENTRY_COST);
    const states = bot.shootingStates.length;
    bot.socket.emit("shootingStop", {});
    await wait(shotGap);
    bot.socket.emit("shootingShot", { hit: true });
    await wait(500);
    expect(bot.shootingStates).toHaveLength(states);
    expect(broke.shootingStates).toEqual([]);
    expect(broke.moneys).toEqual([]);
  } finally {
    bot.socket.disconnect();
    broke.socket.disconnect();
  }
});

/**
 * Mira no pato em pé mais perto do meio dos trilhos e atira (F). O tiro é resolvido no
 * próximo frame, antes de os patos andarem, contra a tela atual: acerta onde mirou.
 */
async function shootDuck(page: Page): Promise<void> {
  await page.evaluate(() => {
    const api = window.__jogo!;
    const { booth, ducks } = api.shooting();
    if (!booth) throw new Error("sem barraca");
    // Distância lateral até o meio da barraca (eixo +X local do balcão).
    const lateral = (d: { x: number; z: number }) =>
      Math.abs((d.x - booth.x) * Math.cos(booth.rotationY) - (d.z - booth.z) * Math.sin(booth.rotationY));
    const duck = ducks.filter((d) => d.hittable).sort((a, b) => lateral(a) - lateral(b))[0];
    if (!duck) throw new Error("nenhum pato em pé");
    api.aimAt(duck.x, duck.y, duck.z);
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyF" }));
    window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyF" }));
  });
}

test("Tiro ao Alvo pelo botão de Ação: sem dinheiro avisa; pagando, mira, acerta 5 patos e ganha o prêmio", async ({
  browser,
}) => {
  test.setTimeout(150_000);
  const page = await joinAs(browser, "Atiradora", 4);
  const action = page.getByTestId("action-label");
  const panel = page.getByTestId("shooting-panel");
  const shooting = () => page.evaluate(() => window.__jogo!.shooting());
  const booth = (await shooting()).booth!;
  expect(booth.ownerName).toBe(SHOOTING_OWNER_NAME);
  expect(booth.signText).toBe(SHOOTING_SIGN_TEXT);
  const spot = boothSpot(booth);
  const faceCounter = async () => {
    await page.evaluate(([x, z]) => window.__jogo!.lookAt(x, z), [booth.x, booth.z] as const);
    await page.keyboard.down("KeyW");
    await page.waitForTimeout(80);
    await page.keyboard.up("KeyW");
  };

  // Sem dinheiro: a Ação mostra o preço, mas só avisa.
  await walkToFountain(page);
  await walkAroundFountainTo(page, booth, spot);
  await faceCounter();
  await expect(action).toContainText(`Jogar (R$ ${SHOOTING_ENTRY_COST})`);
  await page.keyboard.press("KeyF");
  await expect(page.getByTestId("hud-notice")).toHaveText(`Você precisa de R$ ${SHOOTING_ENTRY_COST} para jogar.`);
  expect((await shooting()).status).toBe("idle");
  await expect(panel).toBeHidden();

  // Pesca um peixe e vende ao comerciante para ter a entrada.
  const square = await page.evaluate(() => window.__jogo!.square()!);
  await walkTo(page, square.fountain.x, square.fountain.z, 3.3);
  await page.keyboard.press("KeyF");
  await hookOneFish(page);
  await page.keyboard.press("KeyQ");
  await walkFromFountainToMerchant(page);
  await page.keyboard.press("KeyF");
  await page.getByTestId("merchant-sell-fish").click();
  await expect(page.getByTestId("money")).toHaveText("💰 R$ 1");
  await page.keyboard.press("KeyQ");

  // Volta à barraca e joga: paga a entrada, pega a espingarda e a mira aparece.
  const merchant = await page.evaluate(() => window.__jogo!.merchant()!);
  const { x: fx, z: fz } = square.fountain;
  const out = Math.atan2(merchant.x - fx, merchant.z - fz);
  await walkTo(page, fx + Math.sin(out) * 5, fz + Math.cos(out) * 5, 0.8);
  await walkAroundFountainTo(page, booth, spot);
  await faceCounter();
  await page.keyboard.press("KeyF");
  await expect(panel).toBeVisible();
  await expect(page.getByTestId("shooting-crosshair")).toBeVisible();
  await expect(page.getByTestId("money")).toHaveText("💰 R$ 0");
  await expect(action).toContainText("Atirar");
  await expect.poll(async () => (await page.evaluate(() => window.__jogo!.local())).anim).toBe("aim");
  // Espera a câmera chegar ao ombro (a mira depende dela).
  await page.waitForTimeout(800);

  for (let hits = 1; hits <= SHOOTING_TARGETS_TO_WIN; hits++) {
    await shootDuck(page);
    await expect.poll(async () => (await shooting()).hits).toBe(hits);
    await page.waitForTimeout(SHOOTING_SHOT_COOLDOWN_MS + 50);
  }
  await expect(page.getByTestId("shooting-message")).toContainText(`ganhou R$ ${SHOOTING_PRIZE}`);
  await expect(page.getByTestId("money")).toHaveText(`💰 R$ ${SHOOTING_PRIZE}`);
  await expect(page.locator(".reaction-bubble--active", { hasText: "🏆" })).toHaveCount(1);
  // Depois do resultado guarda a espingarda e a Ação volta a ser "Jogar".
  await expect(panel).toBeHidden();
  await expect(action).toContainText("Jogar");
  expect((await page.evaluate(() => window.__jogo!.local())).anim).not.toBe("aim");

  // Outra partida: errar (mirando na parede) encerra sem prêmio.
  await page.keyboard.press("KeyF");
  await expect(panel).toBeVisible();
  await expect(page.getByTestId("money")).toHaveText(`💰 R$ ${SHOOTING_PRIZE - SHOOTING_ENTRY_COST}`);
  await page.waitForTimeout(800);
  await page.evaluate(([x, z]) => window.__jogo!.aimAt(x, 0.5, z), [booth.x, booth.z] as const);
  await page.keyboard.press("KeyF");
  await expect(page.getByTestId("shooting-message")).toHaveText("Errou! Fim de jogo.");
  await expect.poll(async () => (await shooting()).status).toBe("idle");
  await expect(page.getByTestId("money")).toHaveText(`💰 R$ ${SHOOTING_PRIZE - SHOOTING_ENTRY_COST}`);
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

  await faceAlongFountain(ana);
  // Segura W até andar uns metros (no headless o FPS da praça é baixo, então o tempo varia).
  const origin = await ana.evaluate(() => window.__jogo!.local());
  await ana.keyboard.down("KeyW");
  await ana.waitForFunction(
    ([x, z]) => {
      const p = window.__jogo!.local();
      return Math.hypot(p.x - x, p.z - z) > 2.5;
    },
    [origin.x, origin.z] as const,
    { timeout: 10_000 },
  );
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
  await expect(page.getByTestId("controls-help")).toHaveCount(0);

  // Arrasta o analógico para cima, até a borda (corre para frente).
  const box = await page.getByTestId("touch-stick").boundingBox();
  if (!box) throw new Error("analógico sem posição");
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await faceAlongFountain(page);
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
