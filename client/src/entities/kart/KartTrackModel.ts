import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { KART_WALL_HEIGHT, MAX_PLAYERS } from "@jogo/shared/constants";
import { gridSlot, KART_HALF_WIDTH, pathPoint, rightOf, type KartPath } from "@jogo/shared/kart";
import { Model } from "../Model";
import { createBannerTexture, createCheckerTexture } from "./raceTextures";

/** Pneus das muretas: raio e lados de cada pilha (poucos lados: são centenas na tela). */
const TIRE_RADIUS = 0.3;
const TIRE_SIDES = 9;
/** Pneu de baixo, escuro; a cor de cada pilha (vermelho ou branco) só pinta o de cima. */
const TIRE_BOTTOM_SHADE = 0.12;
/** Distância (m) do meio da pista até o meio das muretas, dos dois lados. */
export const KART_WALL_OFFSET = KART_HALF_WIDTH + TIRE_RADIUS;
/** Cada caixa de colisão da mureta cobre este tanto de pontos do traçado (~1 m cada). */
const WALL_SEGMENT_POINTS = 2;
const ASPHALT_Y = 0.02;
const LINE_WIDTH = 0.15;
/** Zebras: nas curvas com raio menor que isto (m), em faixas vermelhas e brancas deste comprimento. */
const KERB_MAX_RADIUS = 28;
const KERB_WIDTH = 0.7;
const KERB_STRIPE = 1.5;
/** Pórtico da largada: postes fora das muretas, altura e a faixa com o nome. */
const GANTRY_HEIGHT = 4.2;
const GANTRY_POST_GAP = 0.9;
const BANNER_HEIGHT = 1.1;
export const KART_BANNER_TEXT = "Kartódromo do Vitinho";

type Point = { x: number; z: number };

/** Uma caixa de colisão da mureta: centro, giro e meio comprimento. */
export interface WallSegment {
  x: number;
  z: number;
  rotationY: number;
  halfLength: number;
}

/** O traçado deslocado `lateral` metros para a direita (bordas, faixas e muretas). */
function offsetLine(path: KartPath, lateral: number): Point[] {
  return path.points.map((p, i) => {
    const r = rightOf(path.dirs[i]!);
    return { x: p.x + r.x * lateral, z: p.z + r.z * lateral };
  });
}

/** Raio da curva em cada ponto do traçado (Infinity nas retas). */
function curveRadii(path: KartPath): number[] {
  const n = path.points.length;
  return path.dirs.map((_, i) => {
    const a = path.dirs[(i - 2 + n) % n]!;
    const b = path.dirs[(i + 2) % n]!;
    const angle = Math.acos(Math.min(1, Math.max(-1, a.x * b.x + a.z * b.z)));
    return angle < 1e-4 ? Infinity : (4 * path.step) / angle;
  });
}

/**
 * Triângulos (virados para cima) de uma faixa entre duas linhas paralelas ao traçado: `lo` mais à
 * esquerda e `hi` mais à direita, do ponto i ao j.
 */
function quad(lo: Point[], hi: Point[], i: number, j: number): Point[] {
  return [lo[i]!, hi[i]!, lo[j]!, hi[i]!, hi[j]!, lo[j]!];
}

/** Geometria deitada no chão a partir de triângulos (e cores, se houver). */
function flatGeometry(points: Point[], y: number, colors?: number[]): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(points.flatMap((p) => [p.x, y, p.z]), 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(points.flatMap(() => [0, 1, 0]), 3));
  if (colors) geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  return geometry;
}

/**
 * A pista: asfalto, faixas brancas nas bordas, zebras nas curvas, linha de chegada quadriculada,
 * grid de largada, muretas de pneus vermelhos e brancos e o pórtico com a faixa. Tudo em
 * coordenadas do mundo (o `root` fica na origem).
 */
export class KartTrackModel extends Model {
  /** Muretas de dentro e de fora, divididas em caixas retas. */
  static wallSegments(path: KartPath): WallSegment[] {
    const segments: WallSegment[] = [];
    for (const side of [-1, 1]) {
      const line = offsetLine(path, side * KART_WALL_OFFSET);
      for (let i = 0; i < line.length; i += WALL_SEGMENT_POINTS) {
        const a = line[i]!;
        const b = line[(i + WALL_SEGMENT_POINTS) % line.length]!;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        // O X local da caixa aponta para (cos φ, −sen φ): ao longo do trecho.
        segments.push({ x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, rotationY: Math.atan2(-dz, dx), halfLength: Math.hypot(dx, dz) / 2 + 0.15 });
      }
    }
    return segments;
  }

  /** Postes do pórtico, um de cada lado da largada, e a altura deles. */
  static gantryPosts(path: KartPath): { x: number; z: number; height: number }[] {
    return [-1, 1].map((side) => ({ ...pathPoint(path, 0, side * (KART_WALL_OFFSET + GANTRY_POST_GAP)), height: GANTRY_HEIGHT }));
  }

  constructor(path: KartPath, inside: 1 | -1) {
    super();
    const white = this.mat(0xf4f4f4);
    this.strip(path, -KART_HALF_WIDTH, KART_HALF_WIDTH, this.mat(0x3b3e44, false, 0.95), ASPHALT_Y);
    for (const side of [-1, 1]) {
      const edge = side * (KART_HALF_WIDTH - 0.3);
      this.strip(path, edge - LINE_WIDTH / 2, edge + LINE_WIDTH / 2, white, ASPHALT_Y + 0.004);
    }
    this.buildKerbs(path);

    // Linha de largada/chegada, atravessada na pista (o X local fica perpendicular ao sentido).
    const start = pathPoint(path, 0);
    const lineMat = new THREE.MeshStandardMaterial({ map: this.track(createCheckerTexture(16, 2)), roughness: 0.9 });
    const line = this.mesh(new THREE.PlaneGeometry(KART_HALF_WIDTH * 2, 1).rotateX(-Math.PI / 2), lineMat);
    line.position.set(start.x, ASPHALT_Y + 0.008, start.z);
    line.rotation.y = start.rotationY;
    line.castShadow = false;

    // Grid: uma risca branca na frente de cada lugar.
    const mark = new THREE.BoxGeometry(1.3, 0.01, 0.12);
    for (let slot = 0; slot < MAX_PLAYERS; slot++) {
      const s = gridSlot(path, inside, slot);
      const m = this.mesh(mark, white);
      m.position.set(s.x + Math.sin(s.rotationY) * 0.95, ASPHALT_Y + 0.006, s.z + Math.cos(s.rotationY) * 0.95);
      m.rotation.y = s.rotationY;
      m.castShadow = false;
    }

    this.buildTires(path);
    this.buildGantry(path, white);
  }

  /** Faixa deitada no chão acompanhando o traçado, de `from` a `to` metros para a direita. */
  private strip(path: KartPath, from: number, to: number, material: THREE.Material, y: number): void {
    const lo = offsetLine(path, from);
    const hi = offsetLine(path, to);
    const n = lo.length;
    const triangles: Point[] = [];
    for (let i = 0; i < n; i++) triangles.push(...quad(lo, hi, i, (i + 1) % n));
    const mesh = this.mesh(flatGeometry(triangles, y), material);
    mesh.castShadow = false;
  }

  /** Zebras vermelhas e brancas nas duas bordas das curvas (um só desenho, com cores nos vértices). */
  private buildKerbs(path: KartPath): void {
    const radii = curveRadii(path);
    const n = path.points.length;
    const triangles: Point[] = [];
    const colors: number[] = [];
    const red = new THREE.Color(0xd62828);
    const white = new THREE.Color(0xf1f1f1);
    for (const side of [-1, 1]) {
      const edge = offsetLine(path, side * KART_HALF_WIDTH);
      const inner = offsetLine(path, side * (KART_HALF_WIDTH - KERB_WIDTH));
      const [lo, hi] = side < 0 ? [edge, inner] : [inner, edge];
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        if (radii[i]! > KERB_MAX_RADIUS && radii[j]! > KERB_MAX_RADIUS) continue;
        const c = Math.floor((i * path.step) / KERB_STRIPE) % 2 === 0 ? red : white;
        triangles.push(...quad(lo, hi, i, j));
        for (let k = 0; k < 6; k++) colors.push(c.r, c.g, c.b);
      }
    }
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
    const kerbs = this.mesh(flatGeometry(triangles, ASPHALT_Y + 0.006, colors), material);
    kerbs.castShadow = false;
  }

  /**
   * Pilhas de dois pneus nas muretas, num só desenho instanciado (uma instância por pilha). O de
   * baixo é escuro (cor dos vértices) e o de cima alterna vermelho e branco (cor da instância).
   */
  private buildTires(path: KartPath): void {
    const height = KART_WALL_HEIGHT - 0.02;
    // Pneu de baixo sem tampas (ninguém as vê) e o de cima com tampas, cada um com a sua cor.
    const tire = (shade: number, y: number, open: boolean) => {
      const g = new THREE.CylinderGeometry(TIRE_RADIUS, TIRE_RADIUS, height / 2, TIRE_SIDES, 1, open).translate(0, y, 0);
      g.setAttribute("color", new THREE.Float32BufferAttribute(new Array(g.getAttribute("position").count * 3).fill(shade), 3));
      return g;
    };
    const parts = [tire(TIRE_BOTTOM_SHADE, -height / 4, true), tire(1, height / 4, false)];
    const merged = mergeGeometries(parts);
    if (merged) for (const part of parts) part.dispose();
    const geometry = this.track(merged ?? parts[1]!);
    const material = this.track(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, vertexColors: true }));

    // Pneus encostados uns nos outros ao longo de cada mureta.
    const gap = TIRE_RADIUS * 2.05;
    const spots: { x: number; z: number; color: number }[] = [];
    for (const side of [-1, 1]) {
      const line = offsetLine(path, side * KART_WALL_OFFSET);
      let next = 0;
      let walked = 0;
      for (let i = 0; i < line.length; i++) {
        const a = line[i]!;
        const b = line[(i + 1) % line.length]!;
        const len = Math.hypot(b.x - a.x, b.z - a.z);
        while (next <= walked + len) {
          const k = len > 0 ? (next - walked) / len : 0;
          const color = Math.floor(spots.length / 2) % 2 === 0 ? 0xd62828 : 0xf1f1f1;
          spots.push({ x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, color });
          next += gap;
        }
        walked += len;
      }
    }
    const tires = this.track(new THREE.InstancedMesh(geometry, material, spots.length));
    const matrix = new THREE.Matrix4();
    const color = new THREE.Color();
    spots.forEach((s, i) => {
      tires.setMatrixAt(i, matrix.makeTranslation(s.x, height / 2 + 0.005, s.z));
      tires.setColorAt(i, color.setHex(s.color));
    });
    this.root.add(tires);
  }

  /** Dois postes e uma viga sobre a linha de largada, com a faixa nas duas faces. */
  private buildGantry(path: KartPath, white: THREE.Material): void {
    const [a, b] = KartTrackModel.gantryPosts(path);
    if (!a || !b) return;
    const post = new THREE.CylinderGeometry(0.12, 0.15, GANTRY_HEIGHT, 10);
    for (const p of [a, b]) this.mesh(post, white).position.set(p.x, GANTRY_HEIGHT / 2, p.z);

    const span = Math.hypot(b.x - a.x, b.z - a.z);
    const gantry = new THREE.Group();
    gantry.position.set((a.x + b.x) / 2, GANTRY_HEIGHT - BANNER_HEIGHT / 2, (a.z + b.z) / 2);
    // O X local vai de um poste ao outro (aponta para (cos φ, −sen φ)).
    gantry.rotation.y = Math.atan2(-(b.z - a.z), b.x - a.x);
    this.root.add(gantry);
    this.mesh(new THREE.BoxGeometry(span, BANNER_HEIGHT, 0.12), this.mat(0x8d0801), gantry);

    const texture = this.track(createBannerTexture(KART_BANNER_TEXT, 1024, Math.round((1024 * BANNER_HEIGHT) / span)));
    const faceMat = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.8 });
    const face = new THREE.PlaneGeometry(span - 0.2, BANNER_HEIGHT - 0.1);
    this.mesh(face, faceMat, gantry).position.z = 0.065;
    const back = this.mesh(face, faceMat, gantry);
    back.position.z = -0.065;
    back.rotation.y = Math.PI;
  }
}
