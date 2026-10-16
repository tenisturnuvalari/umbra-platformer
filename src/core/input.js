/** Klavye girdisi: basılı olanlar + bu karede yeni basılanlar (edge detection). */
export class Input {
  constructor() {
    this.held = new Set();
    this.pressed = new Set();

    const watched = new Set([
      "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown",
      "Space", "KeyA", "KeyD", "KeyW", "KeyS",
      "ShiftLeft", "ShiftRight", "KeyQ", "KeyR",
    ]);

    window.addEventListener("keydown", (e) => {
      if (!watched.has(e.code)) return;
      e.preventDefault();
      if (e.repeat) return;
      this.held.add(e.code);
      this.pressed.add(e.code);
    });

    window.addEventListener("keyup", (e) => this.held.delete(e.code));
    window.addEventListener("blur", () => this.held.clear());
  }

  down(...codes) {
    return codes.some((c) => this.held.has(c));
  }

  hit(...codes) {
    return codes.some((c) => this.pressed.has(c));
  }

  endFrame() {
    this.pressed.clear();
  }
}
