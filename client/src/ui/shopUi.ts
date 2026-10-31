// Peças de interface comuns às lojas (comerciante e loja de roupas).

/** Dinheiro em reais (valores inteiros por enquanto). */
export function formatMoney(amount: number): string {
  return `R$ ${amount}`;
}

/** Botão de painel de loja. Tira o foco ao clicar, para o Espaço (pular) não acionar o botão de novo. */
export function shopButton(className: string, text: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = className;
  b.textContent = text;
  b.addEventListener("click", () => {
    b.blur();
    onClick();
  });
  return b;
}
