// Loop principal: input → física em passo fixo → renderização interpolada → rede.
import * as THREE from "three";
import { PHYSICS_HZ, REACTIONS, TICK_RATE } from "@jogo/shared/constants";
import type {
  AnimalFedMessage,
  FishCountMessage,
  HitMessage,
  JoinMessage,
  JoinRejectReason,
  LobbyMessage,
  MerchantStockMessage,
  MoneyMessage,
  OutfitMessage,
  PlayerJoinedMessage,
  PlayerLeftMessage,
  ReactionMessage,
  ShootingResultMessage,
  ShootingStateMessage,
  SnapshotMessage,
  WelcomeMessage,
} from "@jogo/shared/protocol";
import { LocalPlayer } from "../entities/LocalPlayer";
import type { Network } from "../net/Network";
import { Hud } from "../ui/Hud";
import { Input } from "./Input";
import { Interactions } from "./Interactions";
import type { Music } from "./Music";
import { Physics } from "./Physics";
import { AnimalsManager } from "./AnimalsManager";
import { RemotePlayers } from "./RemotePlayers";
import { Scenery } from "./Scenery";
import { ThirdPersonCamera } from "./ThirdPersonCamera";
import { TouchControls, isTouchDevice } from "./TouchControls";
import { World } from "./World";

const FIXED_DT = 1 / PHYSICS_HZ;
const SEND_INTERVAL = 1 / TICK_RATE;
/** Evita a "espiral da morte" quando a aba fica muito tempo sem renderizar. */
const MAX_STEPS_PER_FRAME = 8;

export class Game {
  /** Chamado se o servidor recusar a reentrada após uma reconexão. */
  onKicked: ((reason: JoinRejectReason) => void) | null = null;

  private readonly world: World;
  private readonly physics: Physics;
  private readonly input: Input;
  private readonly camera: ThirdPersonCamera;
  private readonly hud: Hud;
  private readonly local: LocalPlayer;
  private readonly remotes: RemotePlayers;
  private readonly animalsManager: AnimalsManager;
  private readonly scenery: Scenery;
  private readonly interactions: Interactions;
  private readonly touch: TouchControls | null;
  private readonly moveDir = new THREE.Vector3();
  private selfId: string;
  private frameId = 0;
  private lastTime: number | null = null;
  private accumulator = 0;
  private sendTimer = 0;

  constructor(
    container: HTMLElement,
    private readonly network: Network,
    welcome: WelcomeMessage,
    info: JoinMessage,
    private readonly music: Music,
  ) {
    this.selfId = welcome.selfId;
    this.world = new World(container);
    this.physics = new Physics();

    const self = welcome.players.find((p) => p.id === welcome.selfId);
    const spawn = self?.position ?? { x: 0, y: 0, z: 0 };
    this.local = new LocalPlayer(this.physics, this.world.scene, info.name, info.color, spawn, self?.rotationY ?? 0);
    this.camera = new ThirdPersonCamera(this.world.camera);
    this.camera.yaw = this.local.rotationY;

    this.remotes = new RemotePlayers(this.physics, this.world.scene, this.selfId);
    this.remotes.reset(welcome.players);

    this.animalsManager = new AnimalsManager(this.world.scene);
    this.animalsManager.load(welcome.animals);

    this.scenery = new Scenery(this.physics, this.world.scene);
    this.scenery.load(welcome);

    const touchMode = isTouchDevice();
    this.hud = new Hud(container, touchMode);
    this.hud.setOnline(welcome.players.length);
    this.hud.setConnected(true);
    this.hud.setMusicMuted(music.muted);
    this.hud.onMusicToggle = () => this.toggleMusic();
    music.start();

    const canvas = this.world.renderer.domElement;
    this.touch = touchMode ? new TouchControls(container, canvas) : null;
    this.input = new Input(canvas, this.touch);

    this.interactions = new Interactions({
      container,
      touchMode,
      local: this.local,
      camera: this.camera,
      view: this.world.camera,
      network,
      hud: this.hud,
      input: this.input,
      touch: this.touch,
      square: this.scenery.square,
      animals: this.animalsManager,
      merchantManager: this.scenery.merchant,
      shootingBooth: this.scenery.shootingBooth,
      clothingShop: this.scenery.clothingShop,
      selfId: () => this.selfId,
    });
    this.interactions.reset(welcome);
    this.input.onPointerLockChange = (locked) => this.hud.setPointerLocked(locked);

    this.bindNetwork(true);
    if (import.meta.env.DEV) this.exposeDebugApi();
    this.frameId = requestAnimationFrame(this.loop);
  }

  // ---------- Rede ----------

  /** Liga (`on`) ou desliga os handlers da rede. */
  private bindNetwork(on: boolean): void {
    const s = this.network.socket;
    // `off` recebe os mesmos argumentos que `on` (só que opcionais).
    const listen = on ? s.on.bind(s) : (s.off.bind(s) as typeof s.on);
    listen("welcome", this.onWelcome);
    listen("joinRejected", this.onJoinRejected);
    listen("playerJoined", this.onPlayerJoined);
    listen("playerLeft", this.onPlayerLeft);
    listen("snapshot", this.onSnapshot);
    listen("hit", this.onHit);
    listen("lobby", this.onLobby);
    listen("reaction", this.onReaction);
    listen("fishCount", this.onFishCount);
    listen("animalFed", this.onAnimalFed);
    listen("money", this.onMoney);
    listen("merchantStock", this.onMerchantStock);
    listen("shooting", this.onShooting);
    listen("shootingResult", this.onShootingResult);
    listen("outfit", this.onOutfit);
    listen("outfitSold", this.onOutfitSold);
    listen("disconnect", this.onDisconnect);
  }

  /** Só acontece após reconexão: o servidor nos deu um novo id. */
  private readonly onWelcome = (msg: WelcomeMessage): void => {
    this.selfId = msg.selfId;
    this.remotes.setSelfId(msg.selfId);
    this.remotes.reset(msg.players);
    this.scenery.load(msg);
    this.interactions.reset(msg);
    this.hud.setConnected(true);
    this.network.sendState(this.local.state());
  };

  private readonly onJoinRejected = ({ reason }: { reason: JoinRejectReason }): void => {
    this.onKicked?.(reason);
  };

  private readonly onPlayerJoined = ({ player }: PlayerJoinedMessage): void => this.remotes.add(player);
  private readonly onPlayerLeft = ({ id }: PlayerLeftMessage): void => this.remotes.remove(id);
  private readonly onSnapshot = (msg: SnapshotMessage): void => {
    this.remotes.applySnapshot(msg);
    this.animalsManager.applySnapshot(msg.animals);
  };
  private readonly onFishCount = ({ count }: FishCountMessage): void => this.interactions.fishing.setCount(count);
  private readonly onAnimalFed = ({ animalId }: AnimalFedMessage): void => this.animalsManager.playHeart(animalId);
  private readonly onMoney = ({ amount }: MoneyMessage): void => this.interactions.merchant.setMoney(amount);
  private readonly onMerchantStock = ({ stock }: MerchantStockMessage): void => {
    this.interactions.merchant.setStock(stock);
    this.scenery.merchant.playTrade();
  };
  private readonly onShooting = (msg: ShootingStateMessage): void => this.interactions.shooting.onState(msg);
  private readonly onShootingResult = ({ won }: ShootingResultMessage): void => this.scenery.shootingBooth.playResult(won);
  private readonly onOutfit = ({ outfit }: OutfitMessage): void => this.interactions.clothing.setOutfit(outfit);
  private readonly onOutfitSold = (): void => this.scenery.clothingShop.playSale();
  private readonly onLobby = (msg: LobbyMessage): void => this.hud.setOnline(msg.playerCount);
  private readonly onDisconnect = (): void => this.hud.setConnected(false);

  private readonly onHit = (msg: HitMessage): void => {
    if (msg.targetId === this.selfId) this.local.applyKnockback(msg.knockback);
    else this.remotes.get(msg.targetId)?.playHit();
  };

  private readonly onReaction = (msg: ReactionMessage): void => {
    if (msg.playerId === this.selfId) return;
    const emoji = REACTIONS[msg.reactionId];
    if (emoji) this.remotes.get(msg.playerId)?.character.playReaction(emoji);
  };

  // ---------- Loop ----------

  private readonly loop = (time: number): void => {
    this.frameId = requestAnimationFrame(this.loop);
    const dt = this.lastTime === null ? 0 : Math.min((time - this.lastTime) / 1000, 0.25);
    this.lastTime = time;

    // 1) Intenções do input. A Ação negocia, joga, dá peixe ou pesca conforme o contexto; senão, bate.
    // A Ação vem antes de girar a câmera: o tiro acerta o que estava na tela quando foi apertado.
    const intents = this.input.consume();
    const actionUsed = this.interactions.update(dt, intents);
    if (intents.action && !actionUsed && this.local.tryPunch(time)) this.network.punch();
    this.camera.rotate(intents.lookDX, intents.lookDY);
    const busy = this.interactions.busy;
    if (busy) this.moveDir.set(0, 0, 0);
    else this.camera.toWorldDirection(intents.moveX, intents.moveZ, this.moveDir);
    this.local.setInput(this.moveDir, intents.run, intents.jump && !busy);
    if (intents.toggleMusic) this.toggleMusic();
    if (intents.reaction !== null) {
      const emoji = REACTIONS[intents.reaction];
      if (emoji) {
        this.local.character.playReaction(emoji);
        this.network.sendReaction(intents.reaction);
      }
    }

    // 2) Remotos, animais, peixes e física em passo fixo
    this.remotes.update(time, dt);
    this.animalsManager.update(dt);
    this.scenery.update(dt);
    this.accumulator += dt;
    let steps = 0;
    while (this.accumulator >= FIXED_DT && steps < MAX_STEPS_PER_FRAME) {
      this.local.preStep(FIXED_DT);
      this.physics.step();
      this.local.postStep();
      this.accumulator -= FIXED_DT;
      steps++;
    }
    if (steps === MAX_STEPS_PER_FRAME) this.accumulator = 0;

    // 3) Renderização interpolada
    this.local.render(this.accumulator / FIXED_DT, dt);
    this.camera.update(dt, this.local.renderPosition);
    this.world.followTarget(this.local.renderPosition);
    this.world.render();

    // 4) Envia o próprio estado a 20 Hz
    this.sendTimer += dt;
    if (this.sendTimer >= SEND_INTERVAL) {
      this.sendTimer %= SEND_INTERVAL;
      this.network.sendState(this.local.state());
    }
  };

  private toggleMusic(): void {
    this.hud.setMusicMuted(this.music.toggleMuted());
  }

  private exposeDebugApi(): void {
    window.__jogo = {
      selfId: () => this.selfId,
      local: () => {
        const s = this.local.state();
        return { ...s.position, rotationY: s.rotationY, anim: s.anim };
      },
      remotes: () => this.remotes.debugInfo(),
      lookAt: (x, z) => {
        const p = this.local.renderPosition;
        this.camera.yaw = Math.atan2(x - p.x, z - p.z);
      },
      trees: () => this.scenery.trees.debugInfo(),
      square: () => this.scenery.square.debugInfo(),
      fishing: () => ({ ...this.interactions.fishing.debugInfo(), label: this.interactions.label }),
      animals: () => this.animalsManager.debugInfo(),
      merchant: () => this.interactions.merchant.debugInfo(),
      shooting: () => this.interactions.shooting.debugInfo(),
      clothing: () => this.interactions.clothing.debugInfo(),
      aimAt: (x, y, z) => {
        this.camera.aimAt(new THREE.Vector3(x, y, z));
        this.camera.update(0, this.local.renderPosition);
      },
    };
  }

  dispose(): void {
    cancelAnimationFrame(this.frameId);
    this.music.stop();
    this.bindNetwork(false);
    this.interactions.dispose();
    this.input.dispose();
    this.remotes.clear();
    this.animalsManager.dispose();
    this.scenery.clear();
    this.local.dispose();
    this.physics.dispose();
    this.hud.dispose();
    this.world.dispose();
    delete window.__jogo;
  }
}
