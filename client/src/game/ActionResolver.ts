// Botão de Ação contextual (F, clique ou botão de toque). Cada sistema (comerciante, Tiro
// ao Alvo, dar peixe, pesca…) é um `ActionHandler`; o primeiro da lista que tiver algo a
// fazer ganha a Ação. Se nenhum tiver, a Ação é bater.
import { SHOOTING_ENTRY_COST } from "@jogo/shared/constants";
import { formatMoney } from "../ui/MerchantPanel";

/** Rótulos do botão de Ação. */
export const ACTION_LABELS = {
  punch: "Bater",
  fish: "Pescar",
  hook: "Fisgar",
  feed: "Dar peixe",
  trade: "Negociar",
  closeTrade: "Fechar",
  play: `Jogar (${formatMoney(SHOOTING_ENTRY_COST)})`,
  shoot: "Atirar",
} as const;
export type ActionLabel = (typeof ACTION_LABELS)[keyof typeof ACTION_LABELS];

export interface ActionHandler {
  /** Em andamento (minigame ou painel aberto): recebe a Ação com exclusividade. */
  readonly active: boolean;
  /** O que a Ação faria agora com este sistema, ou null se nada. */
  actionLabel(): ActionLabel | null;
  /** Executa a Ação (só é chamado quando `actionLabel()` não é null ou está `active`). */
  act(): void;
}

export class ActionResolver {
  /** Avisado quando o rótulo da Ação muda. */
  onLabel: ((label: ActionLabel) => void) | null = null;
  private current: ActionLabel = ACTION_LABELS.punch;

  /** `handlers` em ordem de prioridade. */
  constructor(private readonly handlers: readonly ActionHandler[]) {}

  get label(): ActionLabel {
    return this.current;
  }

  /** Quem fica com a Ação agora: o sistema em andamento ou o primeiro com algo a fazer. */
  private resolve(): { handler: ActionHandler; label: ActionLabel } | null {
    const active = this.handlers.find((h) => h.active);
    if (active) return { handler: active, label: active.actionLabel() ?? ACTION_LABELS.punch };
    for (const handler of this.handlers) {
      const label = handler.actionLabel();
      if (label) return { handler, label };
    }
    return null;
  }

  /** Chamar todo frame: atualiza o rótulo. */
  update(): void {
    const label = this.resolve()?.label ?? ACTION_LABELS.punch;
    if (label === this.current) return;
    this.current = label;
    this.onLabel?.(label);
  }

  /** Trata a Ação. Retorna false se nenhum sistema quis (aí a Ação é bater). */
  handle(): boolean {
    const target = this.resolve();
    if (!target) return false;
    target.handler.act();
    this.update();
    return true;
  }
}
