"use client";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import type Lenis from "lenis";

if (typeof window !== "undefined") gsap.registerPlugin(ScrollTrigger);

export { gsap, ScrollTrigger };

export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const pad = (n: number) => String(n).padStart(2, "0");
/** Seconds → HH:MM:SS:FF at 25 fps (broadcast timecode). */
export const tc = (s: number) => {
  s = Math.max(0, s);
  const f = Math.floor((s % 1) * 25);
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(Math.floor(s) % 60)}:${pad(f)}`;
};

export const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
export const finePointer = () => typeof window !== "undefined" && window.matchMedia("(pointer: fine)").matches;

/* Lenis instance shared by the app (created in <SmoothScroll/>). */
let lenisRef: Lenis | null = null;
export const setLenis = (l: Lenis | null) => {
  lenisRef = l;
};
export const getLenis = () => lenisRef;
export const scrollToTop = (smooth = false) => {
  if (lenisRef) lenisRef.scrollTo(0, smooth ? { duration: 2 } : { immediate: true, force: true });
  else window.scrollTo({ top: 0, behavior: smooth ? "smooth" : "auto" });
};

/** Wrap each word in a mask so it can slide up; keeps <em> and <br>. */
export function splitWords(el: HTMLElement): HTMLElement[] {
  if (el.dataset.split) return Array.from(el.querySelectorAll<HTMLElement>(".wi"));
  let html = "";
  const part = (text: string, tag?: string) =>
    text
      .split(/(\s+)/)
      .map((w) =>
        /^\s+$/.test(w) ? " " : w ? `<span class="wm"><span class="wi">${tag ? `<${tag}>${w}</${tag}>` : w}</span></span>` : "",
      )
      .join("");
  el.childNodes.forEach((n) => {
    if (n.nodeType === 3) html += part(n.textContent || "");
    else if (n.nodeName === "BR") html += "<br>";
    else html += part(n.textContent || "", n.nodeName.toLowerCase());
  });
  el.innerHTML = html;
  el.dataset.split = "1";
  return Array.from(el.querySelectorAll<HTMLElement>(".wi"));
}

export function revealWords(el: HTMLElement | null, delay = 0) {
  if (!el || reducedMotion()) return;
  gsap.from(splitWords(el), { yPercent: 115, rotate: 4, duration: 1.3, ease: "expo.out", stagger: 0.06, delay });
}

/** Elapsed seconds → "12s" / "2m 05s". */
export const dur = (s: number | null | undefined) => {
  if (s == null) return "—";
  if (s < 60) return `${Math.round(s)}s`;
  return `${Math.floor(s / 60)}m ${pad(Math.round(s % 60))}s`;
};
