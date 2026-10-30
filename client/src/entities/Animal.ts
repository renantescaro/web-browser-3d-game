import * as THREE from "three";

/** Classe base para todos os animais: geometrias, materiais, body-bob e dispose. */
export abstract class Animal {
  readonly root = new THREE.Group();
  /** Grupo interno: todos os meshes ficam aqui para o body-bob funcionar. */
  protected readonly body = new THREE.Group();
  protected readonly materials: THREE.MeshStandardMaterial[] = [];
  protected readonly geometries: THREE.BufferGeometry[] = [];

  private walkPhase = 0;

  constructor(protected readonly color: string) {
    this.root.add(this.body);
    this.build();
  }

  /** Constrói o modelo 3D. Chamado no constructor — subclasses implementam. */
  protected abstract build(): void;

  protected mat(color: THREE.ColorRepresentation): THREE.MeshStandardMaterial {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
    this.materials.push(m);
    return m;
  }

  /** Cria um mesh, registra a geometria (sem duplicatas) e o adiciona ao pai. */
  protected mesh(
    geo: THREE.BufferGeometry,
    mat: THREE.MeshStandardMaterial,
    parent: THREE.Object3D = this.body,
  ): THREE.Mesh {
    if (!this.geometries.includes(geo)) this.geometries.push(geo);
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  /** Versão mais escura da cor principal, usada em patas e detalhes. */
  protected darker(factor = 0.55): THREE.Color {
    return new THREE.Color(this.color).multiplyScalar(factor);
  }

  /**
   * Atualiza animação de caminhada (body-bob vertical).
   * @param speed Velocidade aproximada em m/s; 0 = parado.
   */
  update(dt: number, speed: number): void {
    this.walkPhase += dt * speed * 3.2;
    const bob = Math.abs(Math.sin(this.walkPhase)) * 0.028 * Math.min(speed, 1);
    this.body.position.y = bob;
  }

  dispose(): void {
    this.root.removeFromParent();
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
  }
}
