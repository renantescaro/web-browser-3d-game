// Servidor HTTP + Socket.IO. Em produção também serve os arquivos do cliente (client/dist).
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "socket.io";
import { SERVER_PORT, SQUARE_RADIUS, SQUARE_TREE_CLEARANCE, TICK_RATE } from "@jogo/shared/constants";
import { FISH_EATING_ANIMALS, type ClientToServerEvents, type ReactionId, type ServerToClientEvents } from "@jogo/shared/protocol";
import { Room } from "./Room.js";
import { generateAnimals } from "./Animals.js";
import { Merchant, MERCHANT_CLEAR_RADIUS } from "./Merchant.js";
import { ShootingBooth } from "./ShootingBooth.js";
import { ShootingGallery, type ShootingUpdate } from "./ShootingGallery.js";
import { generateSquare } from "./Square.js";
import { generateTrees } from "./Trees.js";
import { parseFeedAnimal, parseJoin, parseShootingShot, parseState, parseTrade, RateLimiter } from "./validation.js";

const port = Number(process.env.PORT) || SERVER_PORT;
const clientDist = normalize(join(dirname(fileURLToPath(import.meta.url)), "../../client/dist"));

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".wasm": "application/wasm",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

/** Serve o cliente já compilado (só existe depois de `npm run build`). */
function serveStatic(req: IncomingMessage, res: ServerResponse): void {
  let urlPath = "/";
  try {
    urlPath = decodeURIComponent((req.url ?? "/").split("?")[0] ?? "/");
  } catch {
    res.writeHead(400).end();
    return;
  }
  let file = normalize(join(clientDist, urlPath));
  if (!existsSync(clientDist) || (file !== clientDist && !file.startsWith(clientDist + sep))) {
    res.writeHead(404).end("Não encontrado");
    return;
  }
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(clientDist, "index.html");
  res.writeHead(200, { "Content-Type": MIME[extname(file)] ?? "application/octet-stream" });
  createReadStream(file).pipe(res);
}

const httpServer = createServer(serveStatic);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: true },
});
const animals = generateAnimals();
// A praça é gerada antes das árvores para que elas não nasçam em cima dela.
const square = generateSquare();
const room = new Room(square.position);
const merchant = new Merchant(square);
const shootingBooth = new ShootingBooth(square);
const shootingGallery = new ShootingGallery(shootingBooth, room);
const trees = generateTrees([
  { x: square.position.x, z: square.position.z, radius: SQUARE_RADIUS + SQUARE_TREE_CLEARANCE },
  { x: merchant.position.x, z: merchant.position.z, radius: MERCHANT_CLEAR_RADIUS },
  shootingBooth.clearArea(),
]);
console.log(
  `[servidor] praça gerada em (${square.position.x.toFixed(0)}, ${square.position.z.toFixed(0)}): ` +
    `${square.benches.length} bancos, ${square.fountain.fish.length} peixes`,
);
console.log(`[servidor] ${trees.length} árvores geradas`);
console.log(`[servidor] ${animals.length} animais gerados (${animals.filter(a => a.type === "dog").length} cão, ${animals.filter(a => a.type === "cat").length} gato, ${animals.filter(a => a.type === "horse").length} cavalo)`);

function lobbyMessage() {
  return { takenColors: room.takenColors(), playerCount: room.playerCount };
}

io.on("connection", (socket) => {
  const joinLimiter = new RateLimiter(1, 5);
  const stateLimiter = new RateLimiter(30, 40);
  const punchLimiter = new RateLimiter(5, 5);
  const reactionLimiter = new RateLimiter(6, 10);
  const fishLimiter = new RateLimiter(2, 3);
  const feedLimiter = new RateLimiter(3, 3);
  const tradeLimiter = new RateLimiter(6, 6);
  const shootingLimiter = new RateLimiter(5, 8);

  /** Manda ao jogador o estado do Tiro ao Alvo (e o dinheiro, se mudou); no fim, avisa todos. */
  const sendShooting = ({ state, money }: ShootingUpdate): void => {
    if (money !== null) socket.emit("money", { amount: money });
    socket.emit("shooting", state);
    if (state.phase !== "playing") io.to("game").emit("shootingResult", { playerId: socket.id, won: state.phase === "won" });
  };

  socket.emit("lobby", lobbyMessage());

  socket.on("join", (raw: unknown) => {
    if (room.has(socket.id) || !joinLimiter.allow()) return;
    const msg = parseJoin(raw);
    if (!msg) return;
    const result = room.join(socket.id, msg.name, msg.color, msg.fishCaught, msg.money);
    if (!result.ok) {
      console.log(`[sala] entrada recusada: ${result.reason}`);
      socket.emit("joinRejected", { reason: result.reason });
      return;
    }
    socket.join("game");
    socket.emit("welcome", {
      selfId: socket.id,
      players: room.snapshots(),
      animals: animals.map((a) => a.toData()),
      trees,
      square,
      merchant: merchant.toData(),
      shootingBooth: shootingBooth.toData(),
    });
    socket.to("game").emit("playerJoined", { player: result.player });
    io.emit("lobby", lobbyMessage());
    console.log(`[sala] + ${result.player.name} entrou (${room.playerCount} na sala)`);
  });

  socket.on("state", (raw: unknown) => {
    if (!room.has(socket.id) || !stateLimiter.allow()) return;
    const state = parseState(raw);
    if (state) room.updateState(socket.id, state);
  });

  socket.on("punch", () => {
    if (!room.has(socket.id) || !punchLimiter.allow()) return;
    const hit = room.punch(socket.id);
    if (hit) io.to("game").emit("hit", hit);
  });

  socket.on("reaction", (raw: unknown) => {
    if (!room.has(socket.id) || !reactionLimiter.allow()) return;
    if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 0 || raw > 3) return;
    io.to("game").emit("reaction", { playerId: socket.id, reactionId: raw as ReactionId });
  });

  socket.on("fishCaught", () => {
    if (!room.has(socket.id) || !fishLimiter.allow()) return;
    const count = room.catchFish(socket.id, square.fountain.position);
    if (count !== null) socket.emit("fishCount", { count });
  });

  socket.on("feedAnimal", (raw: unknown) => {
    if (!room.has(socket.id) || !feedLimiter.allow()) return;
    const msg = parseFeedAnimal(raw);
    const animal = msg && animals.find((a) => a.id === msg.animalId);
    // Cavalos não comem peixe; quem já segue o jogador não precisa de outro.
    if (!animal || !FISH_EATING_ANIMALS.includes(animal.type) || animal.followingId === socket.id) return;
    const count = room.giveFish(socket.id, animal);
    if (count === null) return;
    animal.followingId = socket.id;
    socket.emit("fishCount", { count });
    io.to("game").emit("animalFed", { animalId: animal.id, playerId: socket.id });
  });

  socket.on("trade", (raw: unknown) => {
    if (!room.has(socket.id) || !tradeLimiter.allow()) return;
    const msg = parseTrade(raw);
    const result = msg && room.trade(socket.id, msg, merchant);
    if (!result) return;
    socket.emit("fishCount", { count: result.fishCaught });
    socket.emit("money", { amount: result.money });
    io.to("game").emit("merchantStock", { stock: merchant.stockSnapshot(), playerId: socket.id });
  });

  socket.on("shootingStart", () => {
    if (!room.has(socket.id) || !shootingLimiter.allow()) return;
    const update = shootingGallery.start(socket.id);
    if (update) sendShooting(update);
  });

  socket.on("shootingShot", (raw: unknown) => {
    if (!room.has(socket.id) || !shootingLimiter.allow()) return;
    const msg = parseShootingShot(raw);
    const update = msg && shootingGallery.shoot(socket.id, msg.hit);
    if (update) sendShooting(update);
  });

  socket.on("shootingStop", () => {
    if (!room.has(socket.id)) return;
    shootingGallery.stop(socket.id);
  });

  socket.on("disconnect", () => {
    shootingGallery.stop(socket.id);
    const left = room.leave(socket.id);
    if (!left) return;
    io.to("game").emit("playerLeft", { id: socket.id });
    io.emit("lobby", lobbyMessage());
    console.log(`[sala] - ${left.name} saiu (${room.playerCount} na sala)`);
  });
});

const TICK_DT = 1 / TICK_RATE;
setInterval(() => {
  for (const agent of animals) {
    agent.update(TICK_DT, agent.followingId ? room.positionOf(agent.followingId) : null);
  }
  if (room.playerCount === 0) return;
  io.to("game").emit("snapshot", {
    players: room.snapshots(),
    animals: animals.map(a => a.snapshot()),
    t: Date.now(),
  });
}, 1000 / TICK_RATE);

httpServer.listen(port, () => {
  console.log(`[servidor] ouvindo na porta ${port}`);
});

// Encerramento limpo (ex.: `docker stop`), avisando os clientes para reconectarem.
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    console.log(`[servidor] ${signal} recebido, encerrando`);
    io.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  });
}
