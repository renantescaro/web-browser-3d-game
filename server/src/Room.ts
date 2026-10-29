// Estado da sala: entrada/saída, limite de jogadores, cores únicas, estados e socos.
import {
  KNOCKBACK_HORIZONTAL,
  KNOCKBACK_UP,
  MAX_PLAUSIBLE_SPEED,
  MAX_PLAYERS,
  PLAYER_RADIUS,
  PUNCH_CONE_DEG,
  PUNCH_COOLDOWN_MS,
  PUNCH_RANGE,
  SPAWN_RADIUS,
} from "@jogo/shared/constants";
import type { HitMessage, JoinRejectReason, PlayerSnapshot, StateMessage, Vec3 } from "@jogo/shared/protocol";
import { forwardFromYaw } from "@jogo/shared/math";
import { clampToWorld, isValidColor, sanitizeName } from "./validation.js";

interface PlayerRecord {
  snapshot: PlayerSnapshot;
  lastStateAt: number;
  lastPunchAt: number;
}

export type JoinResult = { ok: true; player: PlayerSnapshot } | { ok: false; reason: JoinRejectReason };

export class Room {
  private readonly players = new Map<string, PlayerRecord>();

  get playerCount(): number {
    return this.players.size;
  }

  has(id: string): boolean {
    return this.players.has(id);
  }

  takenColors(): string[] {
    return [...this.players.values()].map((p) => p.snapshot.color);
  }

  snapshots(): PlayerSnapshot[] {
    return [...this.players.values()].map((p) => p.snapshot);
  }

  join(id: string, rawName: unknown, rawColor: unknown): JoinResult {
    if (this.players.size >= MAX_PLAYERS) return { ok: false, reason: "full" };
    const name = sanitizeName(rawName);
    if (!name) return { ok: false, reason: "invalidName" };
    if (!isValidColor(rawColor) || this.takenColors().includes(rawColor)) return { ok: false, reason: "colorTaken" };

    const snapshot: PlayerSnapshot = {
      id,
      name,
      color: rawColor,
      position: this.findSpawn(),
      rotationY: Math.random() * Math.PI * 2,
      velocity: { x: 0, y: 0, z: 0 },
      anim: "idle",
    };
    this.players.set(id, { snapshot, lastStateAt: Date.now(), lastPunchAt: 0 });
    return { ok: true, player: snapshot };
  }

  leave(id: string): PlayerSnapshot | null {
    const record = this.players.get(id);
    if (!record) return null;
    this.players.delete(id);
    return record.snapshot;
  }

  /** Aplica o estado enviado pelo cliente, limitando deslocamentos impossíveis. */
  updateState(id: string, state: StateMessage): void {
    const record = this.players.get(id);
    if (!record) return;
    const now = Date.now();
    const dt = Math.max((now - record.lastStateAt) / 1000, 0.001);
    record.lastStateAt = now;

    const prev = record.snapshot.position;
    let next = state.position;
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const dz = next.z - prev.z;
    const dist = Math.hypot(dx, dy, dz);
    // Folga de 1 m para variações de latência.
    const maxDist = MAX_PLAUSIBLE_SPEED * dt + 1;
    if (dist > maxDist) {
      const k = maxDist / dist;
      next = clampToWorld({ x: prev.x + dx * k, y: prev.y + dy * k, z: prev.z + dz * k });
    }

    const v = state.velocity;
    const speed = Math.hypot(v.x, v.y, v.z);
    const vk = speed > MAX_PLAUSIBLE_SPEED ? MAX_PLAUSIBLE_SPEED / speed : 1;

    record.snapshot = {
      ...record.snapshot,
      position: next,
      rotationY: state.rotationY,
      velocity: { x: v.x * vk, y: v.y * vk, z: v.z * vk },
      anim: state.anim,
    };
  }

  /** Processa a intenção de soco. Retorna o acerto (se houver) ou null. */
  punch(attackerId: string): HitMessage | null {
    const attacker = this.players.get(attackerId);
    if (!attacker) return null;
    const now = Date.now();
    if (now - attacker.lastPunchAt < PUNCH_COOLDOWN_MS) return null;
    attacker.lastPunchAt = now;

    const a = attacker.snapshot;
    const forward = forwardFromYaw(a.rotationY);
    const minCos = Math.cos(((PUNCH_CONE_DEG / 2) * Math.PI) / 180);
    // Alcance medido até a superfície do alvo, não até o centro.
    const reach = PUNCH_RANGE + PLAYER_RADIUS;

    let best: { id: string; dist: number; dir: { x: number; z: number } } | null = null;
    for (const [id, record] of this.players) {
      if (id === attackerId) continue;
      const t = record.snapshot.position;
      const dx = t.x - a.position.x;
      const dz = t.z - a.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist > reach || Math.abs(t.y - a.position.y) > 1.2) continue;
      // Sobrepostos: conta como acerto na direção em que o atacante olha.
      const dir = dist < 0.01 ? forward : { x: dx / dist, z: dz / dist };
      const cos = dir.x * forward.x + dir.z * forward.z;
      if (cos < minCos) continue;
      if (!best || dist < best.dist) best = { id, dist, dir };
    }
    if (!best) return null;

    const knockback: Vec3 = {
      x: best.dir.x * KNOCKBACK_HORIZONTAL,
      y: KNOCKBACK_UP,
      z: best.dir.z * KNOCKBACK_HORIZONTAL,
    };
    return { attackerId, targetId: best.id, knockback };
  }

  /** Escolhe um ponto de nascimento longe dos outros jogadores. */
  private findSpawn(): Vec3 {
    let candidate: Vec3 = { x: 0, y: 0, z: 0 };
    for (let attempt = 0; attempt < 20; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const r = Math.random() * SPAWN_RADIUS;
      candidate = { x: Math.cos(angle) * r, y: 0, z: Math.sin(angle) * r };
      const free = [...this.players.values()].every((p) => {
        const pos = p.snapshot.position;
        return Math.hypot(pos.x - candidate.x, pos.z - candidate.z) > PLAYER_RADIUS * 4;
      });
      if (free) break;
    }
    return candidate;
  }
}
