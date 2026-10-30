import * as THREE from "three";
import { Model } from "../Model";

const BOARD_WIDTH = 2.4;
const BOARD_HEIGHT = 0.7;
const BOARD_DEPTH = 0.08;
const BOARD_Y = 1.7;
const POST_HEIGHT = 2.1;
const TEXTURE_WIDTH = 1024;
const TEXTURE_HEIGHT = Math.round((TEXTURE_WIDTH * BOARD_HEIGHT) / BOARD_WIDTH);

/** Placa de madeira com o nome da praça escrito nas duas faces. */
export class Sign extends Model {
  /** Meias-medidas da caixa de colisão (largura, altura, profundidade). */
  static readonly HALF_EXTENTS = { x: BOARD_WIDTH / 2, y: POST_HEIGHT / 2, z: 0.1 } as const;

  constructor(readonly text: string) {
    super();
    const wood = this.mat(0x7a5230);
    const post = new THREE.CylinderGeometry(0.07, 0.08, POST_HEIGHT, 8);
    for (const x of [-BOARD_WIDTH / 2 + 0.15, BOARD_WIDTH / 2 - 0.15]) {
      this.mesh(post, wood).position.set(x, POST_HEIGHT / 2, 0);
    }
    this.mesh(new THREE.BoxGeometry(BOARD_WIDTH, BOARD_HEIGHT, BOARD_DEPTH), wood).position.y = BOARD_Y;

    const texture = this.track(this.createTextTexture(text));
    const face = new THREE.PlaneGeometry(BOARD_WIDTH - 0.1, BOARD_HEIGHT - 0.1);
    const faceMat = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.9 });
    const front = this.mesh(face, faceMat);
    front.position.set(0, BOARD_Y, BOARD_DEPTH / 2 + 0.002);
    const back = this.mesh(face, faceMat);
    back.position.set(0, BOARD_Y, -BOARD_DEPTH / 2 - 0.002);
    back.rotation.y = Math.PI;
  }

  /** Desenha o texto num canvas e o usa como textura. */
  private createTextTexture(text: string): THREE.CanvasTexture {
    const canvas = document.createElement("canvas");
    canvas.width = TEXTURE_WIDTH;
    canvas.height = TEXTURE_HEIGHT;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#c89b62";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = "#5c3b1e";
      ctx.lineWidth = 14;
      ctx.strokeRect(7, 7, canvas.width - 14, canvas.height - 14);
      ctx.fillStyle = "#3b2512";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      let size = 150;
      do {
        ctx.font = `bold ${size}px system-ui, sans-serif`;
        size -= 6;
      } while (ctx.measureText(text).width > canvas.width * 0.88 && size > 20);
      ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 6);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
  }
}
