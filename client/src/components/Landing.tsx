"use client";

import { useEffect, useRef } from "react";
import { clamp, finePointer, getLenis, gsap, reducedMotion, ScrollTrigger, splitWords, tc } from "@/lib/motion";
import { SITE } from "@/lib/site";
import { CommandBar } from "./CommandBar";
import { SLATES, useScene } from "./Shell";

/* ───────── Demo content for the landing film (a fictional product meeting) ───────── */
const LINES = [
  { t: "Okay. Are we launching mobile checkout on the fourteenth or not?", s: 0 },
  { t: "The retry flow still fails about three percent of the time under load.", s: 1, n: ["act", "Load-test the retry flow · Daniel"] },
  { t: "I can have the copy done by Friday.", s: 2, n: ["act", "Retry-screen copy · Lena · Friday"] },
  { t: "Then we move the launch to the twenty-first. One week.", s: 0, n: ["dec", "Launch moves to the 21st"] },
  { t: "My vote is UPI first. Cards in week two.", s: 3, n: ["dec", "UPI at launch, cards in week two"] },
  { t: "Does the new refund text need legal review?", s: 2, n: ["q", "Legal review of the refund text?"] },
] as const;
const NAMES = ["Sara · Host", "Daniel · Engineering", "Lena · Content", "Ryan · Payments"];
const PEOPLE = ["sara", "daniel", "lena", "ryan"];
const TAGN: Record<string, string> = { act: "Action", dec: "Decision", q: "Question" };
const DEMO_NOT_FOUND = "I could not find this information in the meeting transcript.";
const DEMO_CHAT: [string, string][] = [
  [
    "Why did the launch move?",
    "The launch moved from the 14th to the 21st, one week later. The payment retry flow still fails about 3% of the time under load, and the team didn't want to ship that. Daniel will run one more load test this week.",
  ],
  ["What was the budget for the launch?", DEMO_NOT_FOUND],
];
const BARS = Array.from({ length: 140 }, (_, i) => 0.2 + 0.8 * (Math.abs(Math.sin(i * 0.37) * Math.cos(i * 0.11 + 1) + 0.3 * Math.sin(i * 1.7)) % 1));
const KEYS = [7, 19, 22, 34];

let introPlayed = false;

export function Landing() {
  const root = useRef<HTMLElement>(null);
  const { go } = useScene();

  useEffect(() => {
    const R = root.current!;
    const $ = <T extends Element = HTMLElement>(s: string) => R.querySelector<T>(s)!;
    const $$ = <T extends Element = HTMLElement>(s: string) => Array.from(R.querySelectorAll<T>(s));
    const RM = reducedMotion();
    let alive = true;
    const timers: number[] = [];
    const later = (fn: () => void, ms: number) => timers.push(window.setTimeout(() => alive && fn(), ms));

    /* videos */
    const playSafe = (v: HTMLVideoElement) => {
      v.muted = true;
      v.play().catch(() => {});
    };
    const heroVids = $$<HTMLVideoElement>("#screen video");
    $$<HTMLVideoElement>("video").forEach(playSafe);

    /* the call: speakers, karaoke subtitles, AI notes */
    let li = 0,
      noteN = 0,
      heroT = 761.28;
    const addNote = ([k, txt]: readonly string[]) => {
      const box = $("#ainotes");
      const el = document.createElement("div");
      el.className = "anote";
      el.innerHTML = `<span class="tag ${k}">${TAGN[k]}</span><span class="t">${txt}</span>`;
      box.insertBefore(el, box.children[1]);
      $("#noteCount").textContent = String(++noteN);
      gsap.from(el, { opacity: 0, x: -24, filter: "blur(6px)", duration: 0.8, ease: "expo.out" });
      const all = Array.from(box.querySelectorAll(".anote"));
      if (all.length > 4) {
        const last = all[all.length - 1];
        gsap.to(last, { opacity: 0, duration: 0.4, onComplete: () => last.remove() });
      }
    };
    const playLine = () => {
      const L = LINES[li];
      li = (li + 1) % LINES.length;
      if (li === 1) {
        noteN = 0;
        $$("#ainotes .anote").forEach((n) => n.remove());
        $("#noteCount").textContent = "0";
      }
      $$("#screen .cam").forEach((p, i) => p.classList.toggle("on", i === L.s));
      $$("#pips .pip").forEach((p, i) => p.classList.toggle("on", i === L.s));
      $("#spk").textContent = NAMES[L.s];
      const sub = $("#subtitle");
      sub.innerHTML = `<span class="box">${L.t
        .split(" ")
        .map((w) => `<span class="wd">${w}</span>`)
        .join(" ")}</span>`;
      const ws = Array.from(sub.querySelectorAll(".wd"));
      let i = 0;
      const step = () => {
        ws.forEach((w, j) => {
          w.classList.toggle("on", j <= i);
          w.classList.toggle("now", j === i);
        });
        if (++i < ws.length) later(step, 240);
        else
          later(() => {
            ws.forEach((w) => w.classList.remove("now"));
            if ("n" in L) addNote(L.n);
            later(playLine, 1700);
          }, 300);
      };
      step();
    };

    /* picture-in-picture tiles mirror the four cameras */
    const pipCtx = $$<HTMLCanvasElement>("#pips canvas").map((c) => c.getContext("2d")!);
    let pipTick = 0;
    const drawPips = () => {
      if (++pipTick % 3) return;
      heroVids.forEach((v, i) => {
        if (v.readyState < 2) return;
        const c = pipCtx[i],
          W = c.canvas.width,
          H = c.canvas.height,
          s = Math.max(W / v.videoWidth, H / v.videoHeight);
        const w = v.videoWidth * s,
          h = v.videoHeight * s;
        try {
          c.drawImage(v, (W - w) / 2, (H - h) / 2, w, h);
        } catch {}
      });
    };

    /* process viz content */
    if (!R.querySelector("#v1 i")) $("#v1").insertAdjacentHTML(
      "afterbegin",
      BARS.slice(0, 64)
        .map((h, i) => `<i style="height:${Math.round(h * 100)}%;transition-delay:${i * 8}ms"></i>`)
        .join(""),
    );
    $("#slices").innerHTML = Array.from({ length: 14 }, (_, i) => `<i style="animation-delay:${1.6 + i * 0.1}s"></i>`).join("");
    $("#v5").innerHTML = Array.from(
      { length: 48 },
      (_, i) => `<i class="${KEYS.includes(i) ? "k" : ""}" style="transition-delay:${KEYS.includes(i) ? 0.3 + KEYS.indexOf(i) * 0.22 : 0}s"></i>`,
    ).join("");

    /* marquee reacting to scroll speed */
    const mq = [
      { el: $("#mq1"), x: 0, dir: -1 },
      { el: $("#mq2"), x: -30, dir: 1 },
    ];
    let skew = 0;
    const marquee = () => {
      const v = getLenis()?.velocity ?? 0;
      skew += (clamp(v * 0.35, -10, 10) - skew) * 0.1;
      mq.forEach((m) => {
        const half = m.el.scrollWidth / 2 || 1;
        m.x += m.dir * (0.5 + Math.abs(v) * 0.25);
        if (m.x <= -half) m.x += half;
        if (m.x > 0) m.x -= half;
        m.el.style.transform = `translate3d(${m.x}px,0,0) skewX(${-skew * m.dir}deg)`;
      });
    };

    /* timecode in the nav follows the scroll (a 4-minute reel) */
    const tcEl = document.getElementById("tc");
    const updateTC = () => {
      const max = document.documentElement.scrollHeight - innerHeight;
      if (tcEl) tcEl.textContent = tc(clamp(scrollY / Math.max(1, max)) * 252);
    };
    addEventListener("scroll", updateTC, { passive: true });

    const frame = () => {
      heroT += 1 / 60;
      $("#recTc").textContent = tc(heroT);
      $("#scrFill").style.width = `${(((heroT - 600) % 1690) / 2290) * 100 + 26}%`;
      marquee();
      drawPips();
    };

    const ctx = gsap.context(() => {
      /* preloader (first visit only) */
      const pre = $("#pre");
      const words = splitWords($("#heroH"));
      if (RM || introPlayed) {
        pre.style.display = "none";
      } else {
        gsap.set(pre, { display: "grid", clipPath: "inset(0% 0% 0% 0%)" });
        gsap.set(words, { yPercent: 115, rotate: 4 });
        gsap.set("#heroInner .eyebrow, .hero-side > *", { opacity: 0, y: 24 });
        gsap.set("#screen", { opacity: 0 });
        gsap.set(".hero .aura", { opacity: 0, scale: 1.08 });
        gsap
          .timeline({ onComplete: () => void (introPlayed = true) })
          .set("#preBeam", { width: 0, opacity: 1 })
          .fromTo("#preWord > *", { opacity: 0, y: 14, filter: "blur(10px)" }, { opacity: 1, y: 0, filter: "blur(0px)", duration: 1, ease: "power3.out", stagger: 0.12 })
          .to("#preBeam", { width: "62vw", duration: 1.2, ease: "expo.inOut" }, 0.2)
          .from(".pre-meta", { opacity: 0, duration: 0.6 }, 0.4)
          .to("#preWord > *", { opacity: 0, y: -10, filter: "blur(8px)", duration: 0.5, stagger: 0.05, ease: "power2.in" }, "+=.35")
          .to("#preBeam", { width: "100vw", duration: 0.6, ease: "expo.inOut" }, "<")
          .to(".pre-meta", { opacity: 0, duration: 0.3 }, "<")
          .to(pre, { clipPath: "inset(50% 0% 50% 0%)", duration: 1, ease: "expo.inOut" })
          .to("#preBeam", { opacity: 0, duration: 0.4 }, "-=.3")
          .set(pre, { display: "none" })
          .to(".hero .aura", { opacity: 1, scale: 1, duration: 2.2, ease: "power2.out" }, "-=.8")
          .to(words, { yPercent: 0, rotate: 0, duration: 1.4, ease: "expo.out", stagger: 0.08 }, "<")
          .to("#heroInner .eyebrow, .hero-side > *", { opacity: 1, y: 0, duration: 1.1, ease: "expo.out", stagger: 0.08 }, "-=1.2")
          .to("#screen", { opacity: 1, duration: 1.4, ease: "power2.out" }, "-=1.1");
      }

      /* hero: the call flattens and fills the screen */
      const screen = $("#screen");
      const mobile = () => innerWidth <= 700;
      const startY = () => innerHeight * (mobile() ? 0.8 : 0.74) - innerHeight / 2 + screen.offsetHeight / 2;
      const endScale = () =>
        mobile()
          ? Math.min((innerWidth * 0.94) / screen.offsetWidth, (innerHeight * 0.78) / screen.offsetHeight)
          : Math.max(innerWidth / screen.offsetWidth, innerHeight / screen.offsetHeight);
      gsap.set(screen, { yPercent: -50, y: startY, rotateX: 24, scale: 0.9, transformPerspective: 1800, transformOrigin: "50% 50%" });
      gsap
        .timeline({ scrollTrigger: { trigger: "#hero", start: "top top", end: () => "+=" + innerHeight * 2.2, pin: true, scrub: 1, invalidateOnRefresh: true } })
        .to("#heroInner", { y: () => -innerHeight * 0.28, opacity: 0, filter: "blur(10px)", ease: "power1.in", duration: 0.45 }, 0)
        .to("#hint", { opacity: 0, duration: 0.1 }, 0)
        .to(".hero .aura", { opacity: 0.35, duration: 0.6 }, 0)
        .to(screen, { y: 0, rotateX: 0, scale: endScale, borderRadius: () => (mobile() ? 22 : 0), ease: "power2.inOut", duration: 0.7 }, 0)
        .to("#ainotes", { opacity: 1, duration: 0.15 }, 0.62)
        .to({}, { duration: 0.3 });

      /* statement: words light up as you read */
      const st = $("#stmt");
      const parts: string[] = [];
      if (!st.dataset.split) st.childNodes.forEach((n) => {
        if (n.nodeType === 3)
          (n.textContent || "").split(/(\s+)/).forEach((w) => parts.push(/^\s+$/.test(w) ? " " : w ? `<span class="fw">${w}</span>` : ""));
        else parts.push((n.textContent || "").split(" ").map((w) => `<span class="fw"><em class="serif">${w}</em></span>`).join(" "));
      });
      if (!st.dataset.split) {
        st.innerHTML = parts.join("");
        st.dataset.split = "1";
      }
      gsap.to(st.querySelectorAll(".fw"), { opacity: 1, stagger: 0.1, ease: "none", scrollTrigger: { trigger: st, start: "top 78%", end: "bottom 42%", scrub: true } });
      $$("[data-count]").forEach((b) => {
        const o = { v: 0 };
        gsap.to(o, { v: +b.dataset.count!, duration: 1.6, ease: "power2.out", onUpdate: () => void (b.textContent = String(Math.round(o.v))), scrollTrigger: { trigger: b, start: "top 85%", once: true } });
      });

      /* stacked cards */
      const cards = $$(".scard");
      cards.forEach((c, i) => {
        ScrollTrigger.create({ trigger: c, start: "top 70%", onEnter: () => c.classList.add("on") });
        if (i < cards.length - 1)
          gsap
            .timeline({ scrollTrigger: { trigger: cards[i + 1], start: "top bottom", end: "top 20%", scrub: true } })
            .to(c, { scale: 0.93, ease: "none" }, 0)
            .to(c.querySelector(".shade"), { opacity: 0.55, ease: "none" }, 0);
      });

      /* the margin: transcript under a reading line, highlights land as notes */
      const win = $("#notes .win"),
        txt = $("#mtxt"),
        hls = $$("#mtxt .hl"),
        mc = $$(".mcard");
      const kinds = ["A", "A", "D", "D", "Q", "Q"] as const;
      const setMargin = (p: number) => {
        txt.style.transform = `translateY(${-p * Math.max(0, txt.scrollHeight - win.clientHeight * 0.9)}px)`;
        const cnt = { A: 0, D: 0, Q: 0 };
        hls.forEach((h, i) => {
          const s0 = 0.06 + i * 0.14,
            l = clamp((p - s0) / 0.08);
          h.style.backgroundSize = `${l * 100}% 100%`;
          const o = clamp((p - s0 - 0.05) / 0.06);
          mc[i].style.opacity = String(o);
          mc[i].style.transform = `translateX(${(1 - o) * 30}px)`;
          mc[i].style.filter = `blur(${(1 - o) * 6}px)`;
          if (o > 0.5) cnt[kinds[i]]++;
        });
        $("#cA").textContent = String(cnt.A);
        $("#cD").textContent = String(cnt.D);
        $("#cQ").textContent = String(cnt.Q);
      };
      setMargin(0);
      ScrollTrigger.create({ trigger: "#notes", start: "top top", end: () => "+=" + innerHeight * 2.4, pin: true, scrub: true, onUpdate: (s) => setMargin(s.progress) });

      /* Hinglish → English */
      const SRC = "Haan, toh launch ko ek hafte push karte hain.",
        DST = "Yes, so let's push the launch by one week.";
      const GLY = "/-_·",
        LN = Math.max(SRC.length, DST.length);
      const setLang = (p: number) => {
        const q = clamp((p - 0.15) / 0.6),
          k = q * (LN + 6);
        let out = "";
        for (let i = 0; i < LN; i++) {
          if (i < k - 6) out += `<span class="x">${DST[i] || ""}</span>`;
          else if (i < k) out += `<span class="g">${GLY[(i * 7 + Math.floor(k * 3)) % GLY.length]}</span>`;
          else out += SRC[i] || "";
        }
        $("#langLine").innerHTML = out;
        $("#langBar").style.width = `${q * 100}%`;
        $("#langState").textContent = q >= 1 ? "Translated · English" : q > 0 ? "Translating…" : "Hinglish → English";
        const e = clamp((q - 0.55) / 0.3);
        $("#capEn").style.opacity = String(e);
        $("#capEn").style.transform = `translateY(${(1 - e) * 8}px)`;
        $("#capHi").style.opacity = String(1 - e * 0.45);
      };
      setLang(0);
      ScrollTrigger.create({ trigger: "#lang", start: "top top", end: () => "+=" + innerHeight * 1.5, pin: true, scrub: true, onUpdate: (s) => setLang(s.progress) });
      gsap.fromTo(".lang-cam", { clipPath: "inset(12% 12% 12% 12% round 24px)" }, { clipPath: "inset(0% 0% 0% 0% round 24px)", ease: "none", scrollTrigger: { trigger: "#lang", start: "top 85%", end: "top top", scrub: true } });

      /* chat demo + 3D tilt */
      let demoRan = false;
      const revealText = (el: HTMLElement, text: string, done?: () => void) => {
        const w = text.split(" ");
        let i = 0;
        const t = window.setInterval(() => {
          if (!alive) return clearInterval(t);
          el.textContent = w.slice(0, ++i).join(" ");
          if (i >= w.length) {
            clearInterval(t);
            done?.();
          }
        }, 38);
      };
      const runDemo = () => {
        if (demoRan) return;
        demoRan = true;
        const box = $("#demoMsgs");
        let i = 0;
        const next = () => {
          if (i >= DEMO_CHAT.length) return;
          const [q, a] = DEMO_CHAT[i++];
          const u = document.createElement("div");
          u.className = "msg u";
          box.appendChild(u);
          let k = 0;
          const ty = window.setInterval(() => {
            if (!alive) return clearInterval(ty);
            u.textContent = q.slice(0, ++k);
            if (k >= q.length) {
              clearInterval(ty);
              later(() => reply(a), 350);
            }
          }, 36);
        };
        const reply = (a: string) => {
          const miss = a === DEMO_NOT_FOUND;
          const m = document.createElement("div");
          m.className = "msg a" + (miss ? " miss" : "");
          m.innerHTML = `<span class="lab mono">${miss ? "Not in this video" : "From the transcript"}</span><span class="typing"><i></i><i></i><i></i></span>`;
          box.appendChild(m);
          gsap.from(m, { opacity: 0, y: 10, duration: 0.5 });
          later(() => {
            const body = document.createElement("span");
            m.querySelector(".typing")!.replaceWith(body);
            revealText(body, a, () => later(next, 1000));
          }, 1100);
        };
        next();
      };
      ScrollTrigger.create({ trigger: "#chatDemo", start: "top 72%", once: true, onEnter: runDemo });
      gsap.from("#chatDemo", { y: 80, rotateX: 12, opacity: 0, duration: 1.4, ease: "expo.out", scrollTrigger: { trigger: "#chatDemo", start: "top 85%", once: true } });

      /* bento */
      gsap.from(".tile", { y: 60, opacity: 0, duration: 1.2, ease: "expo.out", stagger: 0.08, scrollTrigger: { trigger: ".bgrid", start: "top 82%", once: true } });

      /* final: floating speakers drift with scroll */
      $$(".float").forEach((f) => {
        gsap.fromTo(f, { y: 60 }, { y: +f.dataset.speed!, ease: "none", scrollTrigger: { trigger: "#final", start: "top bottom", end: "bottom top", scrub: true } });
        gsap.from(f, { scale: 0.7, opacity: 0, duration: 1.4, ease: "expo.out", scrollTrigger: { trigger: "#final", start: "top 70%", once: true } });
      });

      /* headline reveals */
      $$("[data-reveal], #notes h2").forEach((h) => {
        gsap.from(splitWords(h), { yPercent: 115, rotate: 4, duration: 1.3, ease: "expo.out", stagger: 0.05, scrollTrigger: { trigger: h, start: "top 86%", once: true } });
      });
      gsap.from(".foot .word", { yPercent: 40, opacity: 0, duration: 1.6, ease: "expo.out", scrollTrigger: { trigger: ".foot", start: "top 90%", once: true } });
    }, R);

    /* chat window tilt follows the mouse */
    const cw = $("#chatDemo"),
      askSec = $("#ask");
    let tiltMove: ((e: MouseEvent) => void) | null = null,
      tiltLeave: (() => void) | null = null;
    if (finePointer()) {
      const ry = gsap.quickTo(cw, "rotateY", { duration: 0.9, ease: "power3" }),
        rx = gsap.quickTo(cw, "rotateX", { duration: 0.9, ease: "power3" });
      tiltMove = (e) => {
        const r = cw.getBoundingClientRect();
        ry(((e.clientX - r.left) / r.width - 0.5) * 8);
        rx(-((e.clientY - r.top) / r.height - 0.5) * 6);
      };
      tiltLeave = () => {
        ry(0);
        rx(0);
      };
      askSec.addEventListener("mousemove", tiltMove);
      askSec.addEventListener("mouseleave", tiltLeave);
    }
    const spot = (e: MouseEvent) => {
      const t = (e.target as Element).closest<HTMLElement>(".tile");
      if (!t) return;
      const r = t.getBoundingClientRect();
      t.style.setProperty("--mx", `${e.clientX - r.left}px`);
      t.style.setProperty("--my", `${e.clientY - r.top}px`);
    };
    R.addEventListener("mousemove", spot);

    playLine();
    updateTC();
    gsap.ticker.add(frame);
    const refresh = () => ScrollTrigger.refresh();
    const fontsReady = document.fonts?.ready.then(() => alive && refresh());
    void fontsReady;

    return () => {
      alive = false;
      timers.forEach(clearTimeout);
      gsap.ticker.remove(frame);
      removeEventListener("scroll", updateTC);
      R.removeEventListener("mousemove", spot);
      if (tiltMove) askSec.removeEventListener("mousemove", tiltMove);
      if (tiltLeave) askSec.removeEventListener("mouseleave", tiltLeave);
      ctx.revert();
    };
  }, []);

  const scrollTo = (sel: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    const t = document.querySelector<HTMLElement>(sel);
    if (!t) return;
    const l = getLenis();
    if (l) l.scrollTo(t, { duration: 2 });
    else t.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <main id="landing" ref={root}>
      <div id="pre" aria-hidden="true">
        <div className="beam" id="preBeam" />
        <div className="pre-word" id="preWord" style={{ gap: 0 }}>
          <em>After</em>
          <span>word</span>
        </div>
        <div className="pre-meta mono">
          <span>Afterword · Reel 01</span>
          <span>Setting up the room</span>
        </div>
      </div>

      <div>
        <section className="hero" id="hero">
          <div className="aura" aria-hidden="true" />
          <div className="hero-inner" id="heroInner">
            <div className="eyebrow mono">
              <span className="live">
                <i />
                Now watching
              </span>
              <span>Transcribe · Summarise · Extract · Ask</span>
            </div>
            <h1 className="display" id="heroH">
              Every video,
              <br />
              <em>remembered.</em>
            </h1>
            <div className="hero-side">
              <p>
                Paste a link or drop a recording. Get <b>the transcript, a summary, every action item and decision</b>, and a chat that answers only from what was
                said.
              </p>
              <div>
                <CommandBar id="heroUrl" note="Have a file?" withExtras />
              </div>
            </div>
          </div>

          <div className="screen" id="screen" data-cursor="Watch">
            {PEOPLE.map((p, i) => (
              <div className={`cam${i === 0 ? " on" : ""}`} key={p}>
                <video src={`/media/${p}.mp4`} poster={`/media/${p}.jpg`} muted loop playsInline autoPlay preload="auto" />
              </div>
            ))}
            <div className="shade" />
            <div className="scr-top">
              <span className="chip-d">
                <i />
                <span className="tnum" id="recTc">
                  00:12:41:07
                </span>
              </span>
              <span className="chip-d" id="spk">
                Sara · Host
              </span>
            </div>
            <div className="ainotes" id="ainotes">
              <div className="hd">
                <span>AI notes · live</span>
                <span id="noteCount">0</span>
              </div>
            </div>
            <div className="pips" id="pips">
              {["Sara", "Daniel", "Lena", "Ryan"].map((n, i) => (
                <div className={`pip${i === 0 ? " on" : ""}`} key={n}>
                  <canvas width={192} height={120} />
                  <span>{n}</span>
                </div>
              ))}
            </div>
            <div className="subtitle" id="subtitle" />
            <div className="scr-bar">
              <i id="scrFill" />
            </div>
          </div>
          <div className="scroll-hint mono" id="hint">
            <span>Scroll</span>
            <i />
          </div>
        </section>
      </div>

      <section className="statement" id="statement">
        <div className="kicker mono">The problem</div>
        <p id="stmt">
          You sat through a 47-minute call. A week later you remember three sentences, and none of them was the deadline. Drop in the recording and get back{" "}
          <em>everything that mattered</em>, while you get on with your day.
        </p>
        <div className="stats">
          <div>
            <b className="tnum" data-count="5">
              5
            </b>
            <span>passes over every video, from audio to answers</span>
          </div>
          <div>
            <b className="serif">2</b>
            <span>languages in: English, and Hinglish translated to English</span>
          </div>
          <div>
            <b className="tnum" data-count="7">
              7
            </b>
            <span>things you get back from one link</span>
          </div>
        </div>
      </section>

      <section className="process" id="how">
        <div className="sec-title">
          <div className="kicker mono">How it works</div>
          <h2 className="display" data-reveal>
            Five passes, <em>one link.</em>
          </h2>
          <p>Every stage below is a real step in the pipeline, with the real numbers it uses.</p>
        </div>
        <div className="stack" id="stack">
          <Card i={0} gc="#FFC796" no="01" kicker="Listen · yt-dlp / FFmpeg" title={<>Pull the <em>sound</em> out.</>}
            body={<>A YouTube link is downloaded with <b>yt-dlp</b>; a file is converted with <b>FFmpeg</b>. Then the audio is cut into <b>10-minute pieces</b> so nothing is too long to handle.</>}>
            <div className="v-wave" id="v1">
              <b className="v-cut" style={{ left: "33.3%" }} />
              <b className="v-cut" style={{ left: "66.6%" }} />
            </div>
            <div className="chips">
              <span>chunk_0.wav</span>
              <span>chunk_1.wav</span>
              <span>chunk_2.wav</span>
            </div>
          </Card>
          <Card i={1} gc="#FFB8C8" no="02" kicker="Transcribe · Whisper / Sarvam" title={<>Write down <em>every word.</em></>}
            body={<>English is transcribed by <b>Whisper</b>. Hinglish goes to <b>Sarvam AI</b> in <b>25-second slices</b> and comes back as English.</>}>
            <div className="v-row">
              <span>English · Whisper</span>
              <span className="say">
                <span className="typer">So the payment service is stable, but…</span>
              </span>
            </div>
            <div className="v-row">
              <span>Hinglish · Sarvam saaras v2.5</span>
              <span className="say">
                <span className="typer d2">Launch ko ek hafte push karte hain.</span>
              </span>
              <span className="say y">
                <span className="typer d2">Let&apos;s push the launch by a week.</span>
              </span>
              <div className="slices" id="slices" />
            </div>
          </Card>
          <Card i={2} gc="#C9C0FF" no="03" kicker="Summarise · Mistral" title={<>Read in parts, <em>then whole.</em></>}
            body={<>The transcript is read in <b>3,000-character parts</b>. Each gets a short summary, the summaries are merged into one, and a title of <b>eight words or fewer</b> is written.</>}>
            <div className="v-parts">
              <div />
              <div />
              <div />
              <div />
            </div>
            <div className="v-merged">
              <span>Launch moves to the 21st</span>
              <span>UPI first, cards in week two</span>
              <span>Retry flow fails 3% under load</span>
            </div>
          </Card>
          <Card i={3} gc="#FFD3A6" no="04" kicker="Extract · three passes" title={<>Sort what <em>matters.</em></>}
            body={<>Three separate passes find <b>action items</b> with owners and deadlines, <b>decisions</b> that were made, and <b>questions</b> nobody answered.</>}>
            <div className="v-trays">
              {(
                [
                  ["a", "Actions", [0.1, 0.5, 0.9]],
                  ["d", "Decisions", [0.3, 0.7, 1.1]],
                  ["q", "Questions", [0.45, 0.85, 1.25]],
                ] as const
              ).map(([c, l, ds]) => (
                <div className={c} key={c}>
                  <b>{l}</b>
                  {ds.map((d) => (
                    <i key={d} style={{ transitionDelay: `${d}s` }} />
                  ))}
                </div>
              ))}
            </div>
          </Card>
          <Card i={4} gc="#FFB8C8" no="05" kicker="Remember · Chroma" title={<>Ready for <em>questions.</em></>}
            body={<>The transcript is split into <b>500-character passages</b> and indexed. Each question pulls the <b>4 closest passages</b>, and the answer comes only from those.</>}>
            <div className="v-q">
              <span>Why did the launch move?</span>
            </div>
            <div className="v-dots" id="v5" />
            <span>4 of 48 passages used</span>
          </Card>
        </div>
      </section>

      <div>
        <section className="margin" id="notes">
          <div className="sec-title">
            <div className="kicker mono">The output</div>
            <h2 className="display">
              The notes you&apos;d have taken, <em>already taken.</em>
            </h2>
            <p>As it reads, it pulls out who owes what by when, what got decided, and what&apos;s still open.</p>
          </div>
          <div className="m-body">
            <div className="m-doc">
              <div className="bar mono">
                <span>Transcript · sample</span>
                <span>412 words</span>
              </div>
              <div className="win">
                <div className="txt" id="mtxt">
                  Okay, let&apos;s get started. The goal today is simple: are we launching mobile checkout on the fourteenth or not. Daniel, where are we on the
                  backend? So the payment service is stable, but the retry flow still fails about three percent of the time under load. I don&apos;t want to ship
                  that. I&apos;d rather <span className="hl">run one more load test this week</span>. Fair. Lena, what about the copy for the retry screen?
                  It&apos;s drafted. I need one more pass with support so the error messages match what they tell customers.{" "}
                  <span className="hl">I can have it done by Friday</span>. Okay. Then I think the honest answer is{" "}
                  <span className="hl">we move the launch to the twenty-first</span>. One week. Does anyone disagree? No, that works. Second thing, payment
                  methods. Do we ship UPI and cards together? My vote is UPI first. Eighty percent of our test orders used UPI, and cards still need the new 3-D
                  Secure screen. Agreed. <span className="hl">UPI at launch, cards in week two</span>. And guest checkout stays. Sara, can you tell support about
                  the new date? Sure, I&apos;ll send it on Monday. One open thing: <span className="hl">does the new refund text need legal review?</span> I
                  honestly don&apos;t know. Let&apos;s find out. Also, <span className="hl">who&apos;s on call during launch week?</span> We haven&apos;t decided.
                  Let&apos;s take that offline. Okay, I think that&apos;s everything. Thanks, everyone.
                </div>
              </div>
              <div className="scan" />
            </div>
            <div className="m-side">
              <div className="m-count mono">
                <span>
                  Actions <b className="tnum" id="cA">0</b>
                </span>
                <span>
                  Decisions <b className="tnum" id="cD">0</b>
                </span>
                <span>
                  Questions <b className="tnum" id="cQ">0</b>
                </span>
              </div>
              <div className="m-cards">
                {(
                  [
                    ["act", "Action", "Run one more load test on the retry flow", ["Owner · Daniel", "Due · This week"]],
                    ["act", "Action", "Finish the retry-screen copy with support", ["Owner · Lena", "Due · Friday"]],
                    ["dec", "Decision", "Launch moves from the 14th to the 21st", ["Agreed by the room"]],
                    ["dec", "Decision", "UPI at launch, cards in week two", ["80% of test orders used UPI"]],
                    ["q", "Question", "Does the new refund text need legal review?", ["No owner yet"]],
                    ["q", "Question", "Who is on call during launch week?", ["Taken offline"]],
                  ] as const
                ).map(([k, tag, t, meta]) => (
                  <div className="mcard" key={t}>
                    <span className={`tag ${k}`}>{tag}</span>
                    <span className="t">{t}</span>
                    <span className="meta">
                      {meta.map((m) => (
                        <span key={m}>{m}</span>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>

      <div>
        <section className="lang" id="lang">
          <div className="l">
            <div className="top mono">
              <span>Languages</span>
              <span id="langState">Hinglish → English</span>
            </div>
            <div className="line" id="langLine">
              Haan, toh launch ko ek hafte push karte hain.
            </div>
            <p>
              Pick <b>Hinglish</b> before you press Analyze. The audio is transcribed and translated to English in one step, so the summary, notes and chat all
              work in English.
            </p>
            <div className="meter mono">
              <span>Sarvam slices · 25 s each</span>
              <div className="bar">
                <i id="langBar" />
              </div>
            </div>
          </div>
          <div className="lang-cam">
            <video src="/media/lang.mp4" poster="/media/lang.jpg" muted loop playsInline autoPlay preload="metadata" />
            <div className="shade" />
            <div className="scr-top">
              <span className="chip-d">
                <i />
                Hinglish
              </span>
              <span className="chip-d">Sarvam AI</span>
            </div>
            <div className="cap">
              <span className="lang-cap" id="capHi">
                Haan, toh launch ko ek hafte push karte hain.
              </span>
              <span className="lang-cap en" id="capEn" style={{ opacity: 0 }}>
                Yes, so let&apos;s push the launch by one week.
              </span>
            </div>
          </div>
        </section>
      </div>

      <section className="ask" id="ask">
        <div className="l">
          <div className="kicker mono">Chat</div>
          <h2 className="display" data-reveal>
            Ask the video. <em>It answers from the video.</em>
          </h2>
          <p>Every answer is built from the passages of your transcript that match your question. Nothing else gets in.</p>
          <ul>
            <li>Quotes people when it matters</li>
            <li>Short, direct answers</li>
            <li>Tells you when the video doesn&apos;t cover it</li>
          </ul>
        </div>
        <div className="r">
          <div className="chatwin" id="chatDemo">
            <div className="top mono">
              <span className="who">
                <span className="faces">
                  {PEOPLE.map((p) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={p} src={`/media/${p}.jpg`} alt="" />
                  ))}
                </span>
                <span>Checkout launch review</span>
              </span>
              <span>Chat</span>
            </div>
            <div className="msgs" id="demoMsgs" />
            <div className="inp">
              <span>Ask a question about this video…</span>
              <i>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </i>
            </div>
          </div>
        </div>
      </section>

      <section className="bento" id="features">
        <div className="sec-title">
          <div className="kicker mono">What you get</div>
          <h2 className="display" data-reveal>
            Seven things, <em>from one link.</em>
          </h2>
          <p>Title, summary, action items, decisions, open questions, the full transcript, and the chat.</p>
        </div>
        <div className="bgrid">
          <div className="tile t-a">
            <span className="mono">Title &amp; summary</span>
            <p className="ttl">Mobile Checkout Launch: Go/No-Go Review</p>
            <ul>
              <li>Launch moves from 14 to 21 October so the payment retry flow can be fixed first.</li>
              <li>UPI ships at launch; cards follow in week two, after the new 3-D Secure screen.</li>
              <li>Guest checkout stays. Nobody is forced to sign up.</li>
            </ul>
          </div>
          <div className="tile t-b">
            <span className="mono">Action items</span>
            <h4>Who owes what, by when</h4>
            <div className="rows">
              <div><span>Load-test the retry flow</span><span>Daniel · this week</span></div>
              <div><span>Finish retry-screen copy</span><span>Lena · Fri</span></div>
              <div><span>Tell support the new date</span><span>Sara · Mon</span></div>
              <div><span>Agree a failure threshold</span><span>Not specified</span></div>
            </div>
          </div>
          <div className="tile t-c">
            <span className="mono">Decisions</span>
            <span className="big">3</span>
            <p>Every call the room made, written down as it was agreed.</p>
          </div>
          <div className="tile t-d">
            <span className="mono">Open questions</span>
            <span className="big serif">?</span>
            <p>What nobody answered, so it doesn&apos;t get lost.</p>
          </div>
          <div className="tile t-e">
            <span className="mono">Full transcript</span>
            <div className="searchmock">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="6.5" />
                <path d="m16 16 4 4" />
              </svg>
              <b>UPI</b>
              <span style={{ marginLeft: "auto" }} className="mono">
                3 matches
              </span>
            </div>
            <p>
              My vote is <mark>UPI</mark> first. Eighty percent of our test orders used <mark>UPI</mark>…
            </p>
          </div>
        </div>
      </section>

      <section className="marquee" aria-label="Works with">
        <div className="mrow" id="mq1">
          {["Lectures", "Podcasts", "Stand-ups", "Interviews", "Webinars", "Tutorials", "Lectures", "Podcasts", "Stand-ups", "Interviews", "Webinars", "Tutorials"].map((w, i) => (
            <span key={i}>{w}</span>
          ))}
        </div>
        <div className="mrow alt" id="mq2">
          {["Team calls", "Keynotes", "Classes", "Reviews", "Demos", "Team calls", "Keynotes", "Classes", "Reviews", "Demos"].map((w, i) => (
            <span key={i}>{w}</span>
          ))}
        </div>
      </section>

      <section className="final" id="final">
        <div className="aura" aria-hidden="true" />
        {(
          [
            ["f1", "sara", "Sara", -60],
            ["f2", "ryan", "Ryan", -110],
            ["f3", "lena", "Lena", -90],
            ["f4", "daniel", "Daniel", -50],
          ] as const
        ).map(([c, p, n, s]) => (
          <div className={`float ${c}`} data-speed={s} key={c}>
            <video src={`/media/${p}.mp4`} poster={`/media/${p}.jpg`} muted loop playsInline autoPlay preload="metadata" />
            <span>{n}</span>
          </div>
        ))}
        <div className="kicker mono">Your turn</div>
        <h2 className="display" data-reveal>
          Your next meeting is <em>already recorded.</em>
        </h2>
        <CommandBar id="finalUrl" note="Works with any public YouTube video or your own recording." />
      </section>

      <footer className="foot">
        <div className="cols">
          <div>
            <span className="mono">Product</span>
            <a href="#how" onClick={scrollTo("#how")}>How it works</a>
            <a href="#notes" onClick={scrollTo("#notes")}>Notes</a>
            <a href="#ask" onClick={scrollTo("#ask")}>Chat</a>
            <a href="#features" onClick={scrollTo("#features")}>Features</a>
          </div>
          <div>
            <span className="mono">Studio</span>
            <button type="button" onClick={() => go("/studio", SLATES.new)}>New analysis</button>
            <button type="button" onClick={() => go("/studio?src=file", SLATES.new)}>Upload a recording</button>
          </div>
          <div>
            <span className="mono">Languages</span>
            <span>English</span>
            <span>Hinglish</span>
          </div>
          <div>
            <span className="mono">Project</span>
            <a href={SITE.github} target="_blank" rel="noopener noreferrer" data-cursor="GitHub">
              Source on GitHub ↗
            </a>
          </div>
        </div>
        <div className="word" aria-hidden="true">
          <em>After</em>word
        </div>
        <div className="legal mono">
          <span>© {new Date().getFullYear()} Afterword. All rights reserved.</span>
          <span>Every video, remembered.</span>
        </div>
      </footer>
    </main>
  );
}

function Card({ i, gc, no, kicker, title, body, children }: { i: number; gc: string; no: string; kicker: string; title: React.ReactNode; body: React.ReactNode; children: React.ReactNode }) {
  return (
    <article className="scard" style={{ "--i": i, "--gc": gc } as React.CSSProperties}>
      <div className="glow" />
      <div className="txt">
        <span className="no">{no}</span>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <span className="mono">{kicker}</span>
          <h3>{title}</h3>
          <p>{body}</p>
        </div>
      </div>
      <div className="viz">{children}</div>
      <div className="shade" />
    </article>
  );
}
