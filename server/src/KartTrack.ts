// O kartódromo: uma pista com retas e curvas (traçado em `shared/kart.ts`) em volta da praça e de
// todas as barracas dela. O traçado é girado de 90 em 90 graus até caber no mapa, preferindo a
// largada mais perto do centro do mapa. A barraca do Vitinho Queixada fica no meio da pista, ao
// lado da reta principal, logo depois da largada, de costas para a pista e virada para a praça.
import {
  KART_COUNTER_OFFSET,
  KART_ENTRY_COST,
  KART_LAPS,
  KART_OWNER_APPEARANCE,
  KART_OWNER_NAME,
  KART_PRIZE,
  KART_SIGN_TEXT,
  KART_STALL_ALONG,
  KART_STALL_GAP,
  KART_TRACK_WIDTH,
  WORLD_HALF,
} from "@jogo/shared/constants";
import { buildKartPath, insideSide, KART_HALF_WIDTH, pathPoint, type KartPath } from "@jogo/shared/kart";
import { distanceXZ, forwardFromYaw } from "@jogo/shared/math";
import type { KartTrackData, SquareData, Vec3 } from "@jogo/shared/protocol";

/** Folga (m) entre a mureta de fora e a borda do mapa. */
const EDGE_MARGIN = 3;
/** Raio (m) em volta de cada trecho da pista onde não nascem árvores. */
const TREE_CLEARANCE = KART_HALF_WIDTH + 5;
/** Raio (m) em volta da barraca onde não nascem árvores. */
const STALL_CLEAR_RADIUS = 5;

export class KartTrack {
  readonly center: Vec3;
  readonly trackRotation: number;
  readonly path: KartPath;
  /** Lado (+1 direita, −1 esquerda do sentido da corrida) em que fica o meio da pista. */
  readonly inside: 1 | -1;
  /** Pés do Vitinho. */
  readonly position: Vec3;
  readonly rotationY: number;
  readonly counter: Vec3;

  constructor(square: SquareData) {
    const { x: cx, z: cz } = square.position;
    this.center = { x: cx, y: 0, z: cz };
    const limit = WORLD_HALF - EDGE_MARGIN - KART_HALF_WIDTH - 1;
    // Os giros que cabem no mapa, a largada mais perto do centro do mapa primeiro.
    const options = [0, 1, 2, 3]
      .map((k) => {
        const path = buildKartPath(this.center, (k * Math.PI) / 2);
        const fits = path.points.every((p) => Math.abs(p.x) < limit && Math.abs(p.z) < limit);
        return { rotation: (k * Math.PI) / 2, path, fits, start: distanceXZ(pathPoint(path, 0), { x: 0, z: 0 }) };
      })
      .sort((a, b) => Number(b.fits) - Number(a.fits) || a.start - b.start);
    const best = options[0]!;
    if (!best.fits) console.warn("[kart] a pista não coube inteira no mapa");
    this.trackRotation = best.rotation;
    this.path = best.path;
    this.inside = insideSide(this.path, this.center);

    // De costas para a pista, virado para o meio dela (a praça).
    const owner = pathPoint(this.path, KART_STALL_ALONG, this.inside * (KART_HALF_WIDTH + KART_STALL_GAP));
    const edge = pathPoint(this.path, KART_STALL_ALONG);
    this.rotationY = Math.atan2(owner.x - edge.x, owner.z - edge.z);
    this.position = { x: owner.x, y: 0, z: owner.z };
    const f = forwardFromYaw(this.rotationY);
    this.counter = { x: owner.x + f.x * KART_COUNTER_OFFSET, y: 0, z: owner.z + f.z * KART_COUNTER_OFFSET };
  }

  /** Áreas (centro e raio) onde não podem nascer árvores: ao longo da pista e a barraca. */
  clearAreas(): { x: number; z: number; radius: number }[] {
    const along = this.path.points.filter((_, i) => i % 4 === 0).map((p) => ({ ...p, radius: TREE_CLEARANCE }));
    return [...along, { x: this.counter.x, z: this.counter.z, radius: STALL_CLEAR_RADIUS }];
  }

  toData(): KartTrackData {
    return {
      center: this.center,
      trackRotation: this.trackRotation,
      width: KART_TRACK_WIDTH,
      laps: KART_LAPS,
      ownerName: KART_OWNER_NAME,
      appearance: KART_OWNER_APPEARANCE,
      position: this.position,
      rotationY: this.rotationY,
      counter: this.counter,
      signText: KART_SIGN_TEXT,
      entryCost: KART_ENTRY_COST,
      prize: KART_PRIZE,
    };
  }
}
