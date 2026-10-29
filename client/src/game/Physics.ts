// Wrapper do Rapier: mundo, chão, paredes invisíveis e corpos dos personagens.
import RAPIER from "@dimforge/rapier3d-compat";
import { PHYSICS_HZ, PLAYER_HEIGHT, PLAYER_RADIUS, WORLD_HALF } from "@jogo/shared/constants";
import type { Vec3 } from "@jogo/shared/protocol";

/** Distância do centro da cápsula até os pés. */
export const CAPSULE_CENTER_Y = PLAYER_HEIGHT / 2;
const CAPSULE_HALF_HEIGHT = PLAYER_HEIGHT / 2 - PLAYER_RADIUS;
const WALL_HEIGHT = 20;
const WALL_THICKNESS = 1;

export interface CharacterBody {
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
}

let initPromise: Promise<void> | null = null;

export class Physics {
  readonly world: RAPIER.World;

  /** Carrega o WASM do Rapier (uma vez só). */
  static init(): Promise<void> {
    initPromise ??= RAPIER.init();
    return initPromise;
  }

  /** Só chame depois de `Physics.init()` resolver. */
  constructor() {
    // A gravidade é aplicada manualmente no character controller.
    this.world = new RAPIER.World({ x: 0, y: 0, z: 0 });
    this.world.timestep = 1 / PHYSICS_HZ;
    this.createGround();
    this.createWalls();
  }

  private createGround(): void {
    const desc = RAPIER.ColliderDesc.cuboid(WORLD_HALF, 0.5, WORLD_HALF).setTranslation(0, -0.5, 0);
    this.world.createCollider(desc);
  }

  private createWalls(): void {
    const h = WALL_HEIGHT / 2;
    const t = WALL_THICKNESS / 2;
    const edge = WORLD_HALF + t;
    const walls: [number, number, number, number][] = [
      [edge, 0, t, WORLD_HALF + WALL_THICKNESS],
      [-edge, 0, t, WORLD_HALF + WALL_THICKNESS],
      [0, edge, WORLD_HALF + WALL_THICKNESS, t],
      [0, -edge, WORLD_HALF + WALL_THICKNESS, t],
    ];
    for (const [x, z, hx, hz] of walls) {
      this.world.createCollider(RAPIER.ColliderDesc.cuboid(hx, h, hz).setTranslation(x, h, z));
    }
  }

  /** Cria um corpo cinemático com cápsula, posicionado pelos pés. */
  createCharacterBody(feet: Vec3): CharacterBody {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(feet.x, feet.y + CAPSULE_CENTER_Y, feet.z),
    );
    const collider = this.world.createCollider(RAPIER.ColliderDesc.capsule(CAPSULE_HALF_HEIGHT, PLAYER_RADIUS), body);
    return { body, collider };
  }

  createCharacterController(): RAPIER.KinematicCharacterController {
    const controller = this.world.createCharacterController(0.02);
    controller.setUp({ x: 0, y: 1, z: 0 });
    controller.setSlideEnabled(true);
    controller.enableSnapToGround(0.3);
    controller.enableAutostep(0.3, 0.2, false);
    controller.setMaxSlopeClimbAngle((50 * Math.PI) / 180);
    return controller;
  }

  removeBody(body: RAPIER.RigidBody): void {
    this.world.removeRigidBody(body);
  }

  removeController(controller: RAPIER.KinematicCharacterController): void {
    this.world.removeCharacterController(controller);
  }

  step(): void {
    this.world.step();
  }

  dispose(): void {
    this.world.free();
  }
}
