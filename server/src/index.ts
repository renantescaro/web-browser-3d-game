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
import { ClothingShop } from "./ClothingShop.js";
import { Forest } from "./Forest.js";
import { LumberMill } from "./LumberMill.js";
import { Merchant, MERCHANT_CLEAR_RADIUS } from "./Merchant.js";
import { ShootingBooth } from "./ShootingBooth.js";
import { ShootingGallery, type ShootingUpdate } from "./ShootingGallery.js";
import { generateSquare } from "./Square.js";
import { ToolShop } from "./ToolShop.js";
import { generateTrees } from "./Trees.js";
import { parseBuyOutfit, parseBuyTool, parseChopTree, parseSellWood, parseFeedAnimal, parseJoin, parseShootingShot, parseState, parseTrade, RateLimiter } from "./validation.js";

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
const clothingShop = new ClothingShop(square, room);
// A última a escolher lugar: fica no lado mais livre, longe das outras barracas.
const toolShop = new ToolShop(square, [merchant.position, shootingBooth.position, clothingShop.position], room);
const lumberMill = new LumberMill(
  square,
  [merchant.position, shootingBooth.position, clothingShop.position, toolShop.position],
  room,
);
const trees = generateTrees([
  { x: square.position.x, z: square.position.z, radius: SQUARE_RADIUS + SQUARE_TREE_CLEARANCE },
  { x: merchant.position.x, z: merchant.position.z, radius: MERCHANT_CLEAR_RADIUS },
  shootingBooth.clearArea(),
  clothingShop.clearArea(),
  toolShop.clearArea(),
  lumberMill.clearArea(),
]);
const forest = new Forest(trees, room);
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
  const outfitLimiter = new RateLimiter(4, 4);
  const toolLimiter = new RateLimiter(4, 4);
  const chopLimiter = new RateLimiter(2, 3);
  const woodLimiter = new RateLimiter(4, 4);

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
    const result = room.join(socket.id, msg.name, msg.color, msg);
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
      trees: forest.snapshot(),
      square,
      merchant: merchant.toData(),
      shootingBooth: shootingBooth.toData(),
      clothingShop: clothingShop.toData(),
      toolShop: toolShop.toData(),
      lumberMill: lumberMill.toData(),
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
    const inventory = room.catchFish(socket.id, square.fountain.position);
    if (inventory) socket.emit("inventory", { inventory });
  });

  socket.on("feedAnimal", (raw: unknown) => {
    if (!room.has(socket.id) || !feedLimiter.allow()) return;
    const msg = parseFeedAnimal(raw);
    const animal = msg && animals.find((a) => a.id === msg.animalId);
    // Cavalos não comem peixe; quem já segue o jogador não precisa de outro.
    if (!animal || !FISH_EATING_ANIMALS.includes(animal.type) || animal.followingId === socket.id) return;
    const inventory = room.giveFish(socket.id, animal);
    if (!inventory) return;
    animal.followingId = socket.id;
    socket.emit("inventory", { inventory });
    io.to("game").emit("animalFed", { animalId: animal.id, playerId: socket.id });
  });

  socket.on("trade", (raw: unknown) => {
    if (!room.has(socket.id) || !tradeLimiter.allow()) return;
    const msg = parseTrade(raw);
    const result = msg && room.trade(socket.id, msg, merchant);
    if (!result) return;
    socket.emit("inventory", { inventory: result.inventory });
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

  socket.on("buyOutfit", (raw: unknown) => {
    if (!room.has(socket.id) || !outfitLimiter.allow()) return;
    const msg = parseBuyOutfit(raw);
    const sale = msg && clothingShop.sell(socket.id, msg.item);
    if (!msg || !sale) return;
    socket.emit("money", { amount: sale.money });
    socket.emit("outfit", { outfit: sale.outfit });
    io.to("game").emit("outfitSold", { playerId: socket.id, item: msg.item });
  });

  socket.on("buyTool", (raw: unknown) => {
    if (!room.has(socket.id) || !toolLimiter.allow()) return;
    const msg = parseBuyTool(raw);
    const sale = msg && toolShop.sell(socket.id, msg.item);
    if (!msg || !sale) return;
    socket.emit("money", { amount: sale.money });
    socket.emit("inventory", { inventory: sale.inventory });
    io.to("game").emit("toolSold", { playerId: socket.id, item: msg.item });
  });

  socket.on("chopTree", (raw: unknown) => {
    if (!room.has(socket.id) || !chopLimiter.allow()) return;
    const msg = parseChopTree(raw);
    const inventory = msg && forest.chop(socket.id, msg.treeId);
    if (!msg || !inventory) return;
    socket.emit("inventory", { inventory });
    io.to("game").emit("treeChopped", { treeId: msg.treeId, playerId: socket.id });
  });

  socket.on("sellWood", (raw: unknown) => {
    if (!room.has(socket.id) || !woodLimiter.allow()) return;
    const msg = parseSellWood(raw);
    const sale = msg && lumberMill.buy(socket.id, msg.amount);
    if (!msg || !sale) return;
    socket.emit("money", { amount: sale.money });
    socket.emit("inventory", { inventory: sale.inventory });
    io.to("game").emit("woodSold", { playerId: socket.id, amount: msg.amount });
  });

  socket.on("disconnect", () => {
    shootingGallery.stop(socket.id);
    clothingShop.forget(socket.id);
    toolShop.forget(socket.id);
    forest.forget(socket.id);
    lumberMill.forget(socket.id);
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
