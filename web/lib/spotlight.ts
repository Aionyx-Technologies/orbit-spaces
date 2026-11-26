import type { PointerEvent } from "react";

export function trackPointer(event: PointerEvent<HTMLElement>): void {
  const target = event.currentTarget;
  const box = target.getBoundingClientRect();
  target.style.setProperty("--mx", `${event.clientX - box.left}px`);
  target.style.setProperty("--my", `${event.clientY - box.top}px`);
}
