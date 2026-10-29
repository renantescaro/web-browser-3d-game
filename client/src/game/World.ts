// Cena, renderizadores, luzes, céu e chão.
import * as THREE from "three";
import { CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { WORLD_SIZE } from "@jogo/shared/constants";

const SKY_COLOR = 0x8ec5e8;
const GROUND_COLOR = 0x7fb069;
const SHADOW_AREA = 25;
const SUN_OFFSET = new THREE.Vector3(18, 30, 12);

export class World {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(60, 1, 0.1, 400);
  readonly renderer: THREE.WebGLRenderer;
  readonly labelRenderer = new CSS2DRenderer();
  private readonly sun = new THREE.DirectionalLight(0xffffff, 2.2);
  private readonly disposables: { dispose(): void }[] = [];

  constructor(private readonly container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(this.renderer.domElement);

    const labels = this.labelRenderer.domElement;
    labels.style.position = "absolute";
    labels.style.inset = "0";
    labels.style.pointerEvents = "none";
    container.appendChild(labels);

    this.scene.background = new THREE.Color(SKY_COLOR);
    this.scene.fog = new THREE.Fog(SKY_COLOR, 60, 160);

    this.createLights();
    this.createGround();
    this.resize();
    window.addEventListener("resize", this.resize);
  }

  private createLights(): void {
    this.scene.add(new THREE.HemisphereLight(0xdff1ff, 0x4f6b3a, 1.3));

    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const cam = this.sun.shadow.camera;
    cam.left = -SHADOW_AREA;
    cam.right = SHADOW_AREA;
    cam.top = SHADOW_AREA;
    cam.bottom = -SHADOW_AREA;
    cam.near = 1;
    cam.far = 100;
    this.sun.shadow.bias = -0.0005;
    this.sun.position.copy(SUN_OFFSET);
    this.scene.add(this.sun, this.sun.target);
  }

  private createGround(): void {
    const geometry = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE);
    const material = new THREE.MeshStandardMaterial({ color: GROUND_COLOR, roughness: 0.95 });
    const ground = new THREE.Mesh(geometry, material);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Grade sutil para dar noção de movimento num chão liso.
    const grid = new THREE.GridHelper(WORLD_SIZE, WORLD_SIZE / 2, 0x5a8548, 0x67944f);
    grid.position.y = 0.01;
    this.scene.add(grid);

    this.disposables.push(geometry, material, grid.geometry);
    const gridMaterial = grid.material;
    this.disposables.push(...(Array.isArray(gridMaterial) ? gridMaterial : [gridMaterial]));
  }

  /** Faz a área de sombra acompanhar o jogador. */
  followTarget(target: THREE.Vector3): void {
    this.sun.position.copy(target).add(SUN_OFFSET);
    this.sun.target.position.copy(target);
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
    this.labelRenderer.render(this.scene, this.camera);
  }

  private readonly resize = (): void => {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.labelRenderer.setSize(w, h);
  };

  dispose(): void {
    window.removeEventListener("resize", this.resize);
    for (const d of this.disposables) d.dispose();
    this.sun.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.labelRenderer.domElement.remove();
  }
}
