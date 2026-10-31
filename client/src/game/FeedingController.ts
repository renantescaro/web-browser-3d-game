// Dar peixe a um gato ou cachorro: com peixe no inventário e de frente para um deles,
// a Ação manda o peixe. O servidor confere, desconta e responde com `fishCount` e `animalFed`.
import type { LocalPlayer } from "../entities/LocalPlayer";
import type { Network } from "../net/Network";
import { ACTION_LABELS, type ActionHandler, type ActionLabel } from "./ActionResolver";
import type { AnimalsManager } from "./AnimalsManager";

export class FeedingController implements ActionHandler {
  /** Dar peixe é instantâneo: nunca fica "em andamento". */
  readonly active = false;

  constructor(
    private readonly local: LocalPlayer,
    private readonly animals: AnimalsManager,
    private readonly network: Network,
    private readonly fishCount: () => number,
    private readonly selfId: () => string,
  ) {}

  /** Animal que receberia um peixe agora (precisa ter peixe no inventário), ou null. */
  private target(): string | null {
    if (this.fishCount() <= 0) return null;
    return this.animals.feedTarget(this.local.renderPosition, this.local.rotationY, this.selfId());
  }

  actionLabel(): ActionLabel | null {
    return this.target() ? ACTION_LABELS.feed : null;
  }

  act(): void {
    const animalId = this.target();
    if (animalId) this.network.feedAnimal(animalId);
  }
}
