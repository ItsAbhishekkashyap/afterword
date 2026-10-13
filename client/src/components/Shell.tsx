"use client";

import Lenis from "lenis";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from "react";
import { finePointer, gsap, reducedMotion, ScrollTrigger, scrollToTop, setLenis } from "@/lib/motion";

/* ───────── Scene transitions (fade to paper → beam → title → fade in) ───────── */
type Slate = [kicker: string, title: string];
type Ctx = {
  /** Play the veil; `mid` runs while the page is covered. */
  scene: (slate: Slate, mid: () => void | Promise<void>) => Promise<void>;
  /** Navigate to another route behind the veil. */
  go: (href: string, slate: Slate) => void;
};
const SceneCtx = createContext<Ctx>({ scene: async (_s, mid) => void (await mid()), go: () => {} });
export const useScene = () => useContext(SceneCtx);

export const SLATES = {
  home: ["Scene 01", "Home"] as Slate,
  new: ["Scene 02", "New analysis"] as Slate,
  processing: ["Scene 03", "Analyzing"] as Slate,
  results: ["Scene 04", "Your notes"] as Slate,
  error: ["Scene 03", "No signal"] as Slate,
};

/** Resolve when a timeline completes, or jump it to the end if frames are paused (background tab). */
function play(tl: gsap.core.Timeline) {
  return new Promise<void>((resolve) => {
    const limit = window.setTimeout(() => tl.progress(1), tl.duration() * 1000 + 600);
    tl.eventCallback("onComplete", () => {
      clearTimeout(limit);
      resolve();
    });
  });
}

function waitForUrl(href: string, timeout = 2500) {
  const target = new URL(href, location.href);
  return new Promise<void>((resolve) => {
    const t0 = performance.now();
    const check = () => {
      if (location.pathname === target.pathname || performance.now() - t0 > timeout) resolve();
      else setTimeout(check, 30); // a timer, not rAF: rAF pauses in background tabs
    };
    check();
  });
}

export function Shell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const veil = useRef<HTMLDivElement>(null);
  const busy = useRef(false);

  /* Lenis smooth scroll driven by the GSAP ticker */
  useEffect(() => {
    if (reducedMotion()) return;
    const lenis = new Lenis({ duration: 1.25, easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), smoothWheel: true });
    setLenis(lenis);
    lenis.on("scroll", ScrollTrigger.update);
    const tick = (t: number) => lenis.raf(t * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);
    return () => {
      gsap.ticker.remove(tick);
      lenis.destroy();
      setLenis(null);
    };
  }, []);

  /* Still paper grain */
  useEffect(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 180;
    const x = c.getContext("2d")!;
    const d = x.createImageData(180, 180);
    for (let i = 0; i < d.data.length; i += 4) {
      const v = 120 + Math.random() * 135;
      d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
      d.data[i + 3] = 255;
    }
    x.putImageData(d, 0, 0);
    const g = document.getElementById("grain");
    if (g) g.style.backgroundImage = `url(${c.toDataURL()})`;
  }, []);

  /* Custom cursor + magnetic buttons */
  useEffect(() => {
    if (!finePointer() || reducedMotion()) return;
    const cur = document.getElementById("cursor")!;
    const dot = cur.querySelector(".dot")!;
    const ring = cur.querySelector(".ring")!;
    const lab = document.getElementById("cursorLab")!;
    const dx = gsap.quickTo(dot, "x", { duration: 0.12 }),
      dy = gsap.quickTo(dot, "y", { duration: 0.12 });
    const rx = gsap.quickTo(ring, "x", { duration: 0.5, ease: "power3" }),
      ry = gsap.quickTo(ring, "y", { duration: 0.5, ease: "power3" });
    const move = (e: MouseEvent) => {
      cur.classList.add("live");
      dx(e.clientX);
      dy(e.clientY);
      rx(e.clientX);
      ry(e.clientY);
      const m = (e.target as Element | null)?.closest?.<HTMLElement>(".mag");
      if (m) {
        const r = m.getBoundingClientRect();
        gsap.to(m, { x: (e.clientX - r.left - r.width / 2) * 0.3, y: (e.clientY - r.top - r.height / 2) * 0.35, duration: 0.6, ease: "power3", overwrite: "auto" });
      }
    };
    const over = (e: MouseEvent) => {
      const t = (e.target as Element | null)?.closest?.<HTMLElement>("[data-cursor]");
      cur.classList.toggle("big", !!t);
      if (t) lab.textContent = t.dataset.cursor || "";
    };
    const out = (e: MouseEvent) => {
      const m = (e.target as Element | null)?.closest?.(".mag");
      if (m && !m.contains(e.relatedTarget as Node)) gsap.to(m, { x: 0, y: 0, duration: 0.6, ease: "power3", overwrite: "auto" });
    };
    addEventListener("mousemove", move);
    document.addEventListener("mouseover", over);
    document.addEventListener("mouseout", out);
    return () => {
      removeEventListener("mousemove", move);
      document.removeEventListener("mouseover", over);
      document.removeEventListener("mouseout", out);
    };
  }, []);

  const scene = useCallback<Ctx["scene"]>(async ([k, t], mid) => {
    if (busy.current) return;
    if (reducedMotion() || !veil.current) {
      await mid();
      scrollToTop();
      return;
    }
    busy.current = true;
    const v = veil.current;
    const beam = v.querySelector(".beam")!,
      lab = v.querySelector<HTMLElement>(".lab")!;
    v.querySelector("#veilK")!.textContent = k;
    v.querySelector("#veilT")!.textContent = t;
    await play(
      gsap
        .timeline()
        .set(v, { visibility: "visible" })
        .set(beam, { width: 0, opacity: 1 })
        .set(lab, { opacity: 0, y: 12, filter: "blur(8px)" })
        .to(v, { opacity: 1, duration: 0.45, ease: "power2.inOut" })
        .to(beam, { width: "70vw", duration: 0.7, ease: "expo.inOut" }, "-=.1")
        .to(lab, { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.6, ease: "expo.out" }, "-=.45"),
    );
    try {
      await mid();
    } finally {
      scrollToTop();
      ScrollTrigger.refresh();
      await play(
        gsap
          .timeline()
          .to({}, { duration: 0.3 })
          .to(lab, { opacity: 0, y: -10, filter: "blur(8px)", duration: 0.4, ease: "power2.in" })
          .to(beam, { width: "100vw", opacity: 0, duration: 0.5, ease: "power2.in" }, "<")
          .to(v, { opacity: 0, duration: 0.6, ease: "power2.inOut" })
          .set(v, { visibility: "hidden" }),
      );
      busy.current = false;
    }
  }, []);

  const go = useCallback<Ctx["go"]>(
    (href, slate) => {
      scene(slate, async () => {
        router.push(href, { scroll: false });
        await waitForUrl(href);
        await new Promise((r) => setTimeout(r, 120));
      });
    },
    [router, scene],
  );

  return (
    <SceneCtx.Provider value={{ scene, go }}>
      <div id="grain" aria-hidden="true" />
      <div className="cursor" id="cursor" aria-hidden="true">
        <div className="ring">
          <span id="cursorLab">View</span>
        </div>
        <div className="dot" />
      </div>
      <div id="veil" ref={veil} aria-hidden="true">
        <div className="beam" />
        <div className="lab">
          <span className="mono" id="veilK">
            Scene 02
          </span>
          <b id="veilT">Studio</b>
        </div>
      </div>
      <Nav pathname={pathname} />
      {children}
    </SceneCtx.Provider>
  );
}

function Nav({ pathname }: { pathname: string }) {
  const { go } = useScene();
  const home = pathname === "/";
  const nav = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = nav.current!;
    if (!home) {
      el.classList.add("solid");
      return;
    }
    const onScroll = () => el.classList.toggle("solid", scrollY > innerHeight * 0.4);
    onScroll();
    addEventListener("scroll", onScroll, { passive: true });
    return () => removeEventListener("scroll", onScroll);
  }, [home]);

  const toSection = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    const t = document.querySelector<HTMLElement>(e.currentTarget.getAttribute("href")!);
    if (!t) return;
    import("@/lib/motion").then(({ getLenis }) => {
      const l = getLenis();
      if (l) l.scrollTo(t, { duration: 2 });
      else t.scrollIntoView({ behavior: "smooth" });
    });
  };

  return (
    <header className="nav" id="nav" ref={nav}>
      <Link
        className="brand"
        href="/"
        data-cursor="Home"
        aria-label="Afterword home"
        onClick={(e) => {
          e.preventDefault();
          if (home) scrollToTop(true);
          else go("/", SLATES.home);
        }}
      >
        <i />
        <span>
          <em>After</em>word
        </span>
      </Link>
      <nav className="links" aria-label="Sections" style={{ visibility: home ? undefined : "hidden" }}>
        <a href="#how" onClick={toSection}>How it works</a>
        <a href="#notes" onClick={toSection}>Notes</a>
        <a href="#ask" onClick={toSection}>Chat</a>
        <a href="#features" onClick={toSection}>Features</a>
      </nav>
      <div className="tc mono">
        TC <b className="tnum" id="tc">00:00:00:00</b>
      </div>
      {home && (
        <button className="pill pill-ink mag" data-cursor="Open" onClick={() => go("/studio", SLATES.new)}>
          <span className="lbl">
            <span>Open studio</span>
            <span>Open studio</span>
          </span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M7 17 17 7M9 7h8v8" />
          </svg>
        </button>
      )}
    </header>
  );
}

/** Small toast used by copy buttons etc. */
export function toast(msg: string) {
  let t = document.getElementById("toast");
  if (!t) {
    t = document.createElement("div");
    t.id = "toast";
    t.className = "toast";
    t.setAttribute("role", "status");
    document.body.appendChild(t);
  }
  t.textContent = msg;
  gsap.fromTo(t, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.4, ease: "power3.out", overwrite: true });
  gsap.to(t, { opacity: 0, duration: 0.4, delay: 2.2 });
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast("Copied");
  } catch {
    toast("Copy isn't allowed here. Select the text instead.");
  }
}
