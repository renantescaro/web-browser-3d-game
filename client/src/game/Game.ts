// Loop principal: input → física em passo fixo → renderização interpolada → rede.
import * as THREE from "three";
import { PHYSICS_HZ, REACTIONS, TICK_RATE } from "@jogo/shared/constants";
import type {
  FishCountMessage,
  HitMessage,
  JoinMessage,
  JoinRejectReason,
  LobbyMessage,
  PlayerJoinedMessage,
  PlayerLeftMessage,
  ReactionMessage,
  SnapshotMessage,
  WelcomeMessage,
} from "@jogo/shared/protocol";
import { LocalPlayer } from "../entities/LocalPlayer";
import type { Network } from "../net/Network";
import { Hud } from "../ui/Hud";
import { ACTION_LABELS, FishingController, type FishingDebugInfo } from "./FishingController";
import { Input } from "./Input";
import type { Music } from "./Music";
import { Physics } from "./Physics";
import { AnimalsManager } from "./AnimalsManager";
import { RemotePlayers } from "./RemotePlayers";
import { SquareManager, type SquareDebugInfo } from "./SquareManager";
import { ThirdPersonCamera } from "./ThirdPersonCamera";
import { TouchControls, isTouchDevice } from "./TouchControls";
import { TreesManager } from "./TreesManager";
import { World } from "./World";

const FIXED_DT = 1 / PHYSICS_HZ;
const SEND_INTERVAL = 1 / TICK_RATE;
/** Evita a "espiral da morte" quando a aba fica muito tempo sem renderizar. */
const MAX_STEPS_PER_FRAME = 8;

/** API de depuração usada pelos testes E2E (só em desenvolvimento). */
export interface DebugApi {
  selfId: () => string;
  local: () => { x: number; y: number; z: number; rotationY: number; anim: string };
  remotes: () => { id: string; name: string; x: number; y: number; z: number }[];
  /** Gira a câmera para olhar um ponto (assim "W" anda até ele). */
  lookAt: (x: number, z: number) => void;
  trees: () => { type: string; x: number; z: number; scale: number }[];
  square: () => SquareDebugInfo | null;
  fishing: () => FishingDebugInfo;
}

declare global {
  interface Window {
    __jogo?: DebugApi;
  }
}

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
  private readonly treesManager: TreesManager;
  private readonly squareManager: SquareManager;
  private readonly fishing: FishingController;
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

    this.treesManager = new TreesManager(this.physics, this.world.scene);
    this.treesManager.load(welcome.trees);

    this.squareManager = new SquareManager(this.physics, this.world.scene);
    this.squareManager.load(welcome.square);

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

    this.fishing = new FishingController(container, touchMode, this.local, this.squareManager, network);
    this.fishing.onActionLabel = (label) => {
      this.hud.setAction(label);
      this.touch?.setActionLabel(label);
    };
    this.fishing.onCount = (count) => this.hud.setFishCount(count);
    this.fishing.setCount(self?.fishCaught ?? 0);
    this.hud.setAction(ACTION_LABELS.punch);
    this.input.onPointerLockChange = (locked) => this.hud.setPointerLocked(locked);

    this.bindNetwork();
    if (import.meta.env.DEV) this.exposeDebugApi();
    this.frameId = requestAnimationFrame(this.loop);
  }

  // ---------- Rede ----------

  private bindNetwork(): void {
    const s = this.network.socket;
    s.on("welcome", this.onWelcome);
    s.on("joinRejected", this.onJoinRejected);
    s.on("playerJoined", this.onPlayerJoined);
    s.on("playerLeft", this.onPlayerLeft);
    s.on("snapshot", this.onSnapshot);
    s.on("hit", this.onHit);
    s.on("lobby", this.onLobby);
    s.on("reaction", this.onReaction);
    s.on("fishCount", this.onFishCount);
    s.on("disconnect", this.onDisconnect);
  }

  private unbindNetwork(): void {
    const s = this.network.socket;
    s.off("welcome", this.onWelcome);
    s.off("joinRejected", this.onJoinRejected);
    s.off("playerJoined", this.onPlayerJoined);
    s.off("playerLeft", this.onPlayerLeft);
    s.off("snapshot", this.onSnapshot);
    s.off("hit", this.onHit);
    s.off("lobby", this.onLobby);
    s.off("reaction", this.onReaction);
    s.off("fishCount", this.onFishCount);
    s.off("disconnect", this.onDisconnect);
  }

  /** Só acontece após reconexão: o servidor nos deu um novo id. */
  private readonly onWelcome = (msg: WelcomeMessage): void => {
    this.selfId = msg.selfId;
    this.remotes.setSelfId(msg.selfId);
    this.remotes.reset(msg.players);
    this.treesManager.load(msg.trees);
    this.squareManager.load(msg.square);
    this.fishing.stop();
    const self = msg.players.find((p) => p.id === msg.selfId);
    if (self) this.fishing.setCount(self.fishCaught);
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
  private readonly onFishCount = ({ count }: FishCountMessage): void => this.fishing.setCount(count);
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

    // 1) Intenções do input. A Ação pesca na frente da fonte; senão, bate.
    const intents = this.input.consume();
    this.camera.rotate(intents.lookDX, intents.lookDY);
    this.fishing.update(dt, intents);
    if (intents.action && !this.fishing.handleAction() && this.local.tryPunch(time)) this.network.punch();
    if (this.fishing.active) this.moveDir.set(0, 0, 0);
    else this.camera.toWorldDirection(intents.moveX, intents.moveZ, this.moveDir);
    this.local.setInput(this.moveDir, intents.run, intents.jump && !this.fishing.active);
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
    this.squareManager.update(dt);
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
      trees: () => this.treesManager.debugInfo(),
      square: () => this.squareManager.debugInfo(),
      fishing: () => this.fishing.debugInfo(),
    };
  }

  dispose(): void {
    cancelAnimationFrame(this.frameId);
    this.music.stop();
    this.unbindNetwork();
    this.fishing.dispose();
    this.input.dispose();
    this.remotes.clear();
    this.animalsManager.dispose();
    this.treesManager.clear();
    this.squareManager.clear();
    this.local.dispose();
    this.physics.dispose();
    this.hud.dispose();
    this.world.dispose();
    delete window.__jogo;
  }
}
