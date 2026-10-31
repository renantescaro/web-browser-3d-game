// Barra do inventário na HUD: um quadrado por espaço, com o emoji do item e a quantidade.
// Espaços vazios aparecem apagados; com tudo cheio, a barra fica vermelha.
import { INVENTORY_SLOTS, inventoryItem, inventorySlots, type Inventory } from "@jogo/shared/inventory";

export class InventoryBar {
  readonly root = document.createElement("div");
  private readonly slots: HTMLElement[] = [];

  constructor() {
    this.root.className = "hud-inventory";
    this.root.dataset.testid = "inventory";
    this.root.title = "Inventário";
    for (let i = 0; i < INVENTORY_SLOTS; i++) {
      const slot = document.createElement("div");
      slot.className = "hud-slot";
      this.slots.push(slot);
      this.root.appendChild(slot);
    }
    this.render({});
  }

  render(inventory: Inventory): void {
    const filled = inventorySlots(inventory);
    this.slots.forEach((slot, i) => {
      const content = filled[i];
      slot.replaceChildren();
      if (!content) {
        delete slot.dataset.item;
        delete slot.dataset.count;
        slot.title = "Vazio";
        return;
      }
      const info = inventoryItem(content.item);
      slot.dataset.item = content.item;
      slot.dataset.count = String(content.count);
      slot.title = `${info.name} (${content.count})`;
      slot.append(info.emoji);
      if (info.stack > 1) {
        const count = document.createElement("b");
        count.textContent = String(content.count);
        slot.append(count);
      }
    });
    this.root.classList.toggle("hud-inventory--full", filled.length >= INVENTORY_SLOTS);
  }
}
