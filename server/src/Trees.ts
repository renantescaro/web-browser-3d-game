// Geração das árvores do cenário: sorteadas uma vez quando o servidor inicia.
import {
  TREE_COUNT,
  TREE_EDGE_MARGIN,
  TREE_MAX_SCALE,
  TREE_MIN_SCALE,
  TREE_MIN_SPACING,
  TREE_SPAWN_CLEAR_RADIUS,
  WORLD_HALF,
} from "@jogo/shared/constants";
import { TREE_TYPES, type TreeData } from "@jogo/shared/protocol";

/** Tentativas por árvore antes de desistir de achar um lugar livre. */
const MAX_ATTEMPTS = 50;

function rand(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

/** Ponto livre: fora da área de nascimento e longe das outras árvores. */
function findSpot(placed: TreeData[]): { x: number; z: number } | null {
  const limit = WORLD_HALF - TREE_EDGE_MARGIN;
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const x = rand(-limit, limit);
    const z = rand(-limit, limit);
    if (Math.hypot(x, z) < TREE_SPAWN_CLEAR_RADIUS) continue;
    const tooClose = placed.some((t) => Math.hypot(t.position.x - x, t.position.z - z) < TREE_MIN_SPACING);
    if (!tooClose) return { x, z };
  }
  return null;
}

export function generateTrees(): TreeData[] {
  const trees: TreeData[] = [];
  for (let i = 0; i < TREE_COUNT; i++) {
    const spot = findSpot(trees);
    if (!spot) break;
    trees.push({
      id: `tree-${i}`,
      type: TREE_TYPES[Math.floor(Math.random() * TREE_TYPES.length)]!,
      position: { x: spot.x, y: 0, z: spot.z },
      rotationY: rand(0, Math.PI * 2),
      scale: rand(TREE_MIN_SCALE, TREE_MAX_SCALE),
    });
  }
  return trees;
}
