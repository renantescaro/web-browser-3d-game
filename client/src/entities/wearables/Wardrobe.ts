import type * as THREE from "three";
import { OUTFIT_SLOTS, type Outfit, type OutfitItemId, type OutfitSlot } from "@jogo/shared/outfits";
import { WEARABLE_MODELS, type WearableAnchors } from "./wearableModels";
import { WornItem } from "./WornItem";

interface Worn {
  id: OutfitItemId;
  item: WornItem;
}

/** O que um `Character` está vestindo: uma peça por parte do corpo, trocadas sob demanda. */
export class Wardrobe {
  private readonly worn = new Map<OutfitSlot, Worn>();

  constructor(private readonly anchors: WearableAnchors) {}

  /** Veste as roupas pedidas; só recria as partes do corpo que mudaram. */
  set(outfit: Outfit): void {
    for (const slot of OUTFIT_SLOTS) {
      const id = outfit[slot];
      const current = this.worn.get(slot);
      if (current?.id === id) continue;
      current?.item.dispose();
      this.worn.delete(slot);
      if (!id) continue;
      const item = new WornItem();
      WEARABLE_MODELS[id](item, this.anchors);
      this.worn.set(slot, { id, item });
    }
  }

  /** Materiais das peças vestidas (o `Character` usa no flash do soco). */
  *materials(): Iterable<THREE.MeshStandardMaterial> {
    for (const { item } of this.worn.values()) yield* item.materials;
  }

  dispose(): void {
    for (const { item } of this.worn.values()) item.dispose();
    this.worn.clear();
  }
}
