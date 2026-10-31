// Coleção de jogadores remotos: entrada, saída, snapshots e sincronia de relógio.
import type * as THREE from "three";
import type { Outfit } from "@jogo/shared/outfits";
import type { PlayerSnapshot, SnapshotMessage } from "@jogo/shared/protocol";
import { RemotePlayer } from "../entities/RemotePlayer";
import type { Physics } from "./Physics";

/** Quanto a estimativa de diferença de relógio pode subir por snapshot (ms). */
const CLOCK_DRIFT_STEP = 0.5;

export class RemotePlayers {
  private readonly players = new Map<string, RemotePlayer>();
  /** Diferença entre o relógio local (performance.now) e o do servidor. */
  private clockOffset: number | null = null;

  constructor(
    private readonly physics: Physics,
    private readonly scene: THREE.Scene,
    private selfId: string,
  ) {}

  setSelfId(id: string): void {
    this.selfId = id;
  }

  get(id: string): RemotePlayer | undefined {
    return this.players.get(id);
  }

  add(snapshot: PlayerSnapshot): void {
    if (snapshot.id === this.selfId || this.players.has(snapshot.id)) return;
    this.players.set(snapshot.id, new RemotePlayer(this.physics, this.scene, snapshot, performance.now()));
  }

  remove(id: string): void {
    this.players.get(id)?.dispose();
    this.players.delete(id);
  }

  /** Recria todos a partir de uma lista (usado no `welcome`, inclusive após reconectar). */
  reset(snapshots: PlayerSnapshot[]): void {
    this.clear();
    this.clockOffset = null;
    for (const s of snapshots) this.add(s);
  }

  applySnapshot(msg: SnapshotMessage): void {
    // Converte o horário do servidor para o relógio local. A estimativa acompanha o menor
    // atraso visto (rede mais rápida) e sobe devagar, para absorver variações de latência.
    const sample = performance.now() - msg.t;
    if (this.clockOffset === null || sample < this.clockOffset) this.clockOffset = sample;
    else this.clockOffset += Math.min(CLOCK_DRIFT_STEP, sample - this.clockOffset);
    const localTime = msg.t + this.clockOffset;

    for (const s of msg.players) {
      if (s.id === this.selfId) continue;
      const player = this.players.get(s.id);
      if (player) player.push(s, localTime);
      else this.add(s);
    }
  }

  update(now: number, dt: number): void {
    for (const p of this.players.values()) p.update(now, dt);
  }

  /** Informações para os testes E2E. */
  debugInfo(): { id: string; name: string; x: number; y: number; z: number; outfit: Outfit }[] {
    return [...this.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      x: p.position.x,
      y: p.position.y,
      z: p.position.z,
      outfit: { ...p.currentOutfit },
    }));
  }

  clear(): void {
    for (const p of this.players.values()) p.dispose();
    this.players.clear();
  }
}
