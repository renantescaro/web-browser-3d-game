// Ferramentas que o Gabriel vende. Nome, emoji e espaço no inventário ficam em `inventory.ts`;
// aqui fica o preço. O jogador carrega no máximo `MAX_TOOLS` ferramentas ao mesmo tempo (pode
// repetir). Ferramenta nova: adicione em `inventory.ts`, aqui, e crie o modelo em
// `client/src/entities/tools/toolModels.ts` (o `Record` obriga).
import type { InventoryItemId } from "./inventory";

/** Quantas ferramentas um jogador carrega ao mesmo tempo. */
export const MAX_TOOLS = 2;

export interface ToolInfo {
  /** Preço em reais. */
  price: number;
}

export const TOOL_ITEMS = {
  axe: { price: 50 },
} satisfies Partial<Record<InventoryItemId, ToolInfo>>;

export type ToolId = keyof typeof TOOL_ITEMS;
export const TOOL_IDS = Object.keys(TOOL_ITEMS) as ToolId[];

export function isToolId(value: unknown): value is ToolId {
  return typeof value === "string" && (TOOL_IDS as string[]).includes(value);
}

export function toolInfo(id: ToolId): ToolInfo {
  return TOOL_ITEMS[id];
}
