// Kartódromo do Vitinho Queixada: regras no servidor (com bots) e a corrida pela interface.
import { expect, test, type Browser, type Page } from "@playwright/test";
import { io, type Socket } from "socket.io-client";
import {
  KART_ENTRY_COST,
  KART_LAPS,
  KART_MAX_SPEED_KMH,
  KART_OWNER_NAME,
  KART_PRIZE,
  KART_RADIUS,
  KART_SIGN_TEXT,
  PLAYER_COLORS,
  SERVER_PORT,
  SHOOTING_BOOTH_DEPTH,
  WORLD_HALF,
} from "@jogo/shared/constants";
import {
  buildKartPath,
  gridSlot,
  insideSide,
  insideTrack,
  KART_HALF_WIDTH,
  kartExitSpot,
  nearestOnPath,
  pathPoint,
  type KartPath,
} from "@jogo/shared/kart";
import { distanceXZ } from "@jogo/shared/math";
import type {
  ClientToServerEvents,
  HitMessage,
  KartRaceMessage,
  ServerToClientEvents,
  Vec3,
  WelcomeMessage,
} from "@jogo/shared/protocol";

type BotSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
const SERVER_URL = `http://localhost:${SERVER_PORT}`;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Conecta direto no servidor (sem navegador) e devolve o número de jogadores na sala. */
function connectBot(): Promise<{ socket: BotSocket; playerCount: number }> {
  return new Promise((resolve, reject) => {
    const socket: BotSocket = io(SERVER_URL, { transports: ["websocket"], forceNew: true });
    socket.once("lobby", ({ playerCount }) => resolve({ socket, playerCount }));
    socket.once("connect_error", reject);
  });
}

/** Bot que entra com dinheiro e anda (ou dirige) mandando `state` direto ao servidor. */
class KartBot {
  position: Vec3 = { x: 0, y: 0, z: 0 };
  races: KartRaceMessage[] = [];
  moneys: number[] = [];
  hits: HitMessage[] = [];
  anims = new Map<string, string>();

  private constructor(
    readonly socket: BotSocket,
    readonly welcome: WelcomeMessage,
  ) {
    const self = welcome.players.find((p) => p.id === welcome.selfId);
    if (self) this.position = self.position;
    this.races.push(welcome.kartRace);
    socket.on("kartRace", (msg) => this.races.push(msg));
    socket.on("money", ({ amount }) => this.moneys.push(amount));
    socket.on("hit", (msg) => this.hits.push(msg));
    socket.on("snapshot", ({ players }) => {
      for (const p of players) this.anims.set(p.name, p.anim);
    });
  }

  static async join(name: string, color: string, money: number): Promise<KartBot> {
    const { socket } = await connectBot();
    const welcome = await new Promise<WelcomeMessage>((resolve, reject) => {
      socket.once("welcome", resolve);
      socket.once("joinRejected", ({ reason }) => reject(new Error(`bot recusado: ${reason}`)));
      socket.emit("join", { name, color, money });
    });
    return new KartBot(socket, welcome);
  }

  get id(): string {
    return this.socket.id ?? "";
  }

  get track() {
    return this.welcome.kartTrack;
  }

  get race(): KartRaceMessage {
    return this.races.at(-1)!;
  }

  /** O traçado da pista, montado do mesmo jeito que o cliente e o servidor montam. */
  get path(): KartPath {
    return buildKartPath(this.track.center, this.track.trackRotation);
  }

  send(position: Vec3, velocity: Vec3 = { x: 0, y: 0, z: 0 }, anim: "run" | "kart" = "kart"): void {
    this.position = position;
    this.socket.emit("state", { position, rotationY: Math.atan2(velocity.x, velocity.z), velocity, anim });
  }

  /** Anda (a 20 m/s, abaixo do limite do servidor) até ficar a `within` metros do alvo. */
  async walkTo(target: { x: number; z: number }, within: number, anim: "run" | "kart" = "run"): Promise<void> {
    for (let i = 0; i < 600; i++) {
      const dx = target.x - this.position.x;
      const dz = target.z - this.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < within) return;
      const k = Math.min(1, dist - within * 0.5) / dist;
      this.send({ x: this.position.x + dx * k, y: 0, z: this.position.z + dz * k }, { x: 0, y: 0, z: 0 }, anim);
      await wait(50);
    }
    throw new Error("não chegou ao alvo");
  }

  /** Segue o traçado no sentido da corrida, `lateral` metros para a direita, por `laps` voltas, a ~22 m/s. */
  async driveLaps(laps: number, lateral: number): Promise<void> {
    const path = this.path;
    let s = nearestOnPath(path, this.position).s;
    if (s > path.length / 2) s -= path.length;
    const end = laps * path.length + 3;
    while (s < end && this.race.phase === "racing") {
      s += 1.1;
      const p = pathPoint(path, s, lateral);
      const velocity = { x: Math.sin(p.rotationY) * 22, y: 0, z: Math.cos(p.rotationY) * 22 };
      this.send({ x: p.x, y: 0, z: p.z }, velocity);
      await wait(50);
    }
  }
}

async function waitForEmptyRoom(): Promise<void> {
  await expect
    .poll(
      async () => {
        const { socket, playerCount } = await connectBot();
        socket.disconnect();
        return playerCount;
      },
      { timeout: 10_000 },
    )
    .toBe(0);
}

async function joinAs(browser: Browser, name: string, colorIndex: number): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  page.on("pageerror", (err) => {
    throw err;
  });
  await page.goto("/");
  await page.getByPlaceholder("Seu nome").fill(name);
  await page.locator(".color-swatch").nth(colorIndex).click();
  await page.getByRole("button", { name: "Entrar" }).click();
  // Com várias abas desenhando na CPU (SwiftShader), o `welcome` pode demorar.
  await expect(page.locator(".join-screen")).toBeHidden({ timeout: 20_000 });
  await page.waitForFunction(() => window.__jogo !== undefined);
  return page;
}

test.beforeEach(async () => {
  await waitForEmptyRoom();
});

test("kart: pista em volta de tudo; inscrição, espera, largada, batida, voltas e prêmio validados no servidor", async () => {
  // A volta tem ~350 m: as 5 voltas do bot levam pouco mais de um minuto.
  test.setTimeout(240_000);
  const a = await KartBot.join("Piloto A", PLAYER_COLORS[0], 50);
  const b = await KartBot.join("Piloto B", PLAYER_COLORS[1], 50);
  const late = await KartBot.join("Atrasado", PLAYER_COLORS[2], 50);
  const broke = await KartBot.join("Duro", PLAYER_COLORS[3], KART_ENTRY_COST - 1);
  const bots = [a, b, late, broke];
  try {
    const track = a.track;
    const { center } = track;
    const path = a.path;
    const inside = insideSide(path, center);
    expect(track.ownerName).toBe(KART_OWNER_NAME);
    expect(track.appearance.bigChin).toBe(true);
    expect(track.signText).toBe(KART_SIGN_TEXT);
    expect(track.laps).toBe(KART_LAPS);
    expect(track.entryCost).toBe(KART_ENTRY_COST);
    // Cabem dois karts lado a lado (com folga).
    expect(track.width).toBeGreaterThan(KART_RADIUS * 2 * 2 + 2);

    // A pista (com retas e curvas, ~350 m) contorna a praça e todas as barracas, e cabe no mapa.
    // A barraca do Vitinho fica no meio dela, de costas para a pista e virada para a praça.
    const w = a.welcome;
    expect(distanceXZ(center, w.square.position)).toBeLessThan(0.01);
    expect(path.length).toBeGreaterThan(300);
    for (const p of path.points) expect(Math.max(Math.abs(p.x), Math.abs(p.z)) + KART_HALF_WIDTH).toBeLessThan(WORLD_HALF);
    const shops = [w.merchant.position, w.clothingShop.position, w.toolShop.position, w.lumberMill.position, w.lumberMill.counter];
    for (const p of [...shops, w.square.position, track.position, track.counter]) {
      expect(insideTrack(path, p)).toBe(true);
      expect(nearestOnPath(path, p).distance).toBeGreaterThan(KART_HALF_WIDTH + 1);
    }
    expect(nearestOnPath(path, w.shootingBooth.position).distance).toBeGreaterThan(KART_HALF_WIDTH + SHOOTING_BOOTH_DEPTH);
    expect(nearestOnPath(path, track.counter).distance).toBeGreaterThan(nearestOnPath(path, track.position).distance);
    for (const tree of w.trees) expect(nearestOnPath(path, tree.position).distance).toBeGreaterThan(KART_HALF_WIDTH + 1);

    await expect.poll(() => a.race.phase, { timeout: 15_000 }).toBe("idle");

    // Longe do balcão: recusado.
    a.socket.emit("kartJoin", {});
    await wait(500);
    expect(a.moneys).toEqual([]);

    const spot = kartExitSpot(track.counter, track.rotationY);
    await Promise.all(bots.map((bot) => bot.walkTo(spot, 0.5)));

    // Sem dinheiro não corre; pagando, abre a espera e não cobra duas vezes.
    broke.socket.emit("kartJoin", {});
    a.socket.emit("kartJoin", {});
    await expect.poll(() => a.moneys).toEqual([50 - KART_ENTRY_COST]);
    a.socket.emit("kartJoin", {});
    await expect.poll(() => late.race.phase).toBe("lobby");
    expect(a.race.racers.map((r) => [r.name, r.slot])).toEqual([["Piloto A", 0]]);
    b.socket.emit("kartJoin", {});
    await expect.poll(() => a.race.racers.map((r) => [r.name, r.slot]).sort()).toEqual([
      ["Piloto A", 0],
      ["Piloto B", 1],
    ]);
    await wait(500);
    expect(a.moneys).toEqual([50 - KART_ENTRY_COST]);
    expect(broke.moneys).toEqual([]);

    // Cada um vai para o seu lugar no grid; batida antes da largada não vale.
    await Promise.all([a.walkTo(gridSlot(path, inside, 0), 0.3, "kart"), b.walkTo(gridSlot(path, inside, 1), 0.3, "kart")]);
    a.socket.emit("kartBump", { targetId: b.id });
    await expect.poll(() => broke.anims.get("Piloto A")).toBe("kart");

    // Na contagem já não dá para entrar.
    await expect.poll(() => a.race.phase, { timeout: 20_000 }).toBe("countdown");
    late.socket.emit("kartJoin", {});
    await expect.poll(() => a.race.phase, { timeout: 5_000 }).toBe("racing");
    expect(late.moneys).toEqual([]);
    expect(a.race.racers).toHaveLength(2);
    expect(b.hits).toEqual([]);

    // Batida valendo: o A encosta no B andando; o B é empurrado (e uma segunda logo em seguida não conta).
    const bPos = b.position;
    const toA = { x: a.position.x - bPos.x, z: a.position.z - bPos.z };
    const gap = Math.hypot(toA.x, toA.z);
    const close = { x: bPos.x + (toA.x / gap) * 1.3, y: 0, z: bPos.z + (toA.z / gap) * 1.3 };
    a.send(close, { x: 8, y: 0, z: 0 });
    await wait(100);
    a.send(close, { x: 8, y: 0, z: 0 });
    await wait(100);
    a.socket.emit("kartBump", { targetId: b.id });
    a.socket.emit("kartBump", { targetId: b.id });
    await expect.poll(() => b.hits.length).toBe(1);
    expect(b.hits[0]).toMatchObject({ attackerId: a.id, targetId: b.id });
    expect(Math.hypot(b.hits[0]!.knockback.x, b.hits[0]!.knockback.z)).toBeGreaterThan(0);

    // O B desiste; o A dá as 5 voltas e leva o prêmio (largaram dois).
    b.socket.emit("kartLeave", {});
    await expect.poll(() => a.race.racers.map((r) => r.name)).toEqual(["Piloto A"]);
    await a.driveLaps(KART_LAPS, inside * 1.5);
    await expect.poll(() => a.race.phase, { timeout: 5_000 }).toBe("results");
    const laps = new Set(a.races.flatMap((r) => r.racers.filter((x) => x.id === a.id).map((x) => x.lap)));
    expect([...laps].sort()).toEqual([1, 2, 3, 4, 5]);
    expect(a.race.winnerId).toBe(a.id);
    expect(a.race.prize).toBe(KART_PRIZE);
    expect(a.race.racers[0]?.finishMs).toBeGreaterThan(0);
    await expect.poll(() => a.moneys.at(-1)).toBe(50 - KART_ENTRY_COST + KART_PRIZE);
    expect(late.race).toMatchObject({ phase: "results", winnerId: a.id });
  } finally {
    for (const bot of bots) bot.socket.disconnect();
  }
});

test("kart pelo botão de Ação: Correr cobra a entrada, senta no kart, o velocímetro sobe com W e Q sai", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const page = await joinAs(browser, "Corredora", 6);
  const watcher = await KartBot.join("Torcedor", PLAYER_COLORS[0], 0);
  try {
    const action = page.getByTestId("action-label");
    const panel = page.getByTestId("kart-panel");
    const speed = page.getByTestId("kart-speed");
    const kart = () => page.evaluate(() => window.__jogo!.kart());
    const track = (await kart()).track!;
    await expect.poll(async () => (await kart()).phase, { timeout: 15_000 }).toBe("idle");

    const spot = kartExitSpot(track.counter, track.rotationY);
    const goToCounter = async () => {
      await page.evaluate(([x, z]) => window.__jogo!.teleport(x, z), [spot.x, spot.z] as const);
      // O servidor aceita a posição nova aos poucos (limite de velocidade).
      await page.waitForTimeout(2500);
      await page.evaluate(([x, z]) => window.__jogo!.lookAt(x, z), [track.counter.x, track.counter.z] as const);
      await page.keyboard.down("KeyW");
      await page.waitForTimeout(80);
      await page.keyboard.up("KeyW");
    };
    await goToCounter();
    await expect(action).toContainText(`Correr (R$ ${KART_ENTRY_COST})`);

    // Sem dinheiro só avisa.
    await page.keyboard.press("KeyF");
    await expect(page.getByTestId("hud-notice")).toHaveText(`Você precisa de R$ ${KART_ENTRY_COST} para correr.`);
    await expect(panel).toBeHidden();

    // Volta (reconexão) com dinheiro e se inscreve: senta no kart no grid.
    await page.evaluate((money) => window.__jogo!.rejoin({ money }), KART_ENTRY_COST + 5);
    await expect(page.getByTestId("money")).toHaveText(`💰 R$ ${KART_ENTRY_COST + 5}`);
    await goToCounter();
    await expect(action).toContainText("Correr");
    await page.keyboard.press("KeyF");
    await expect.poll(async () => (await kart()).driving).toBe(true);
    await expect(page.getByTestId("money")).toHaveText("💰 R$ 5");
    await expect(panel).toBeVisible();
    await expect(page.getByTestId("kart-status")).toContainText("Esperando pilotos");
    await expect(page.getByTestId("kart-speedo")).toBeVisible();
    await expect(speed).toHaveAttribute("data-kmh", "0");
    await expect(action).toContainText("Buzinar");
    expect((await page.evaluate(() => window.__jogo!.local())).anim).toBe("kart");
    await expect.poll(() => watcher.anims.get("Corredora")).toBe("kart");

    // Esperando a largada o kart não anda.
    const grid = await page.evaluate(() => window.__jogo!.local());
    await page.keyboard.down("KeyW");
    await page.waitForTimeout(500);
    await page.keyboard.up("KeyW");
    const still = await page.evaluate(() => window.__jogo!.local());
    expect(Math.hypot(still.x - grid.x, still.z - grid.z)).toBeLessThan(0.2);

    await expect.poll(async () => (await kart()).phase, { timeout: 20_000 }).toBe("countdown");
    await expect(page.getByTestId("kart-countdown")).toBeVisible();
    await expect.poll(async () => (await kart()).phase, { timeout: 5_000 }).toBe("racing");

    // W acelera: o velocímetro sobe (até 60 km/h) e o kart sai do grid.
    // Segura W até o kart sair do grid (no headless o FPS é baixo, então o tempo varia).
    await page.keyboard.down("KeyW");
    await page.waitForFunction(
      ([x, z]) => {
        const p = window.__jogo!.local();
        return Math.hypot(p.x - x, p.z - z) > 2;
      },
      [grid.x, grid.z] as const,
      { timeout: 20_000 },
    );
    const kmh = Number(await speed.getAttribute("data-kmh"));
    await page.keyboard.up("KeyW");
    expect(kmh).toBeGreaterThan(5);
    expect(kmh).toBeLessThanOrEqual(KART_MAX_SPEED_KMH);
    expect((await kart()).kmh).toBeLessThanOrEqual(KART_MAX_SPEED_KMH);
    await expect(page.getByTestId("kart-status")).toContainText(`Volta 1/${KART_LAPS}`);

    // Q desiste: desce do kart na frente da barraca e a entrada não volta.
    await page.keyboard.press("KeyQ");
    await expect.poll(async () => (await kart()).driving).toBe(false);
    await expect(panel).toBeHidden();
    await expect(page.getByTestId("kart-speedo")).toBeHidden();
    await expect.poll(async () => (await page.evaluate(() => window.__jogo!.local())).anim).not.toBe("kart");
    await expect.poll(() => watcher.race.phase).toBe("idle");
    await expect(page.getByTestId("money")).toHaveText("💰 R$ 5");
  } finally {
    watcher.socket.disconnect();
    await page.context().close();
  }
});
