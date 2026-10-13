"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, askVideo, cancelJob, getJob, startAnalysis, type Job, type Language } from "@/lib/api";
import { clamp, dur, getLenis, gsap, reducedMotion, revealWords, tc } from "@/lib/motion";
import { NOT_FOUND, cleanTitle, isNone, outlineText, parseActions, parsePoints, parseSummary, words as countWords, type Point } from "@/lib/parse";
import { ACCEPT, ALLOW_LINKS, FORMATS, MAX_UPLOAD_MB, checkFile, fmtSize, isUrl, takePendingUpload } from "@/lib/upload";
import { copyText, SLATES, toast, useScene } from "./Shell";

type Mode = "boot" | "new" | "processing" | "results" | "error";
/** A file upload, or (only when links are enabled) a YouTube/web link. */
type Input = { file?: File; url?: string; language: Language };

const STAGE_NAMES = ["Preparing the audio", "Transcribing audio", "Generating summary & title", "Extracting insights", "Building chat index"];
const stageDetail = (i: number, lang: Language) =>
  [
    "FFmpeg · 10-min chunks",
    lang === "hinglish" ? "Sarvam AI · translated to English" : "Whisper",
    "3,000-character parts, merged",
    "Action items · decisions · questions",
    "500-character passages",
  ][i];
const CAPS = ["Listening to the audio…", "Writing down every word…", "Reading it in parts…", "Sorting what matters…", "Getting ready for your questions…"];
const BARS = Array.from({ length: 140 }, (_, i) => 0.2 + 0.8 * (Math.abs(Math.sin(i * 0.37) * Math.cos(i * 0.11 + 1) + 0.3 * Math.sin(i * 1.7)) % 1));
const prettySource = (s: string) => s.replace(/^https?:\/\/(www\.)?/, "");
const setTC = (v: string) => {
  const el = document.getElementById("tc");
  if (el) el.textContent = v;
};

/** Enter animation for a view, played once it mounts (the veil is fading out at that moment). */
function useEnter(ref: React.RefObject<HTMLElement | null>, heading: string, items: string) {
  useEffect(() => {
    const el = ref.current;
    if (!el || reducedMotion()) return;
    const h = el.querySelector<HTMLElement>(heading);
    if (h) revealWords(h, 0.1);
    const ctx = gsap.context(() => {
      gsap.from(
        Array.from(el.querySelectorAll<HTMLElement>(items)).filter((e) => !e.matches("h1")),
        { opacity: 0, y: 30, filter: "blur(8px)", duration: 1.1, ease: "expo.out", stagger: 0.07, delay: 0.05, clearProps: "filter,transform,opacity" },
      );
    }, el);
    return () => ctx.revert();
  }, [ref, heading, items]);
}

export function Studio() {
  const router = useRouter();
  const params = useSearchParams();
  const { scene } = useScene();
  const [mode, setMode] = useState<Mode>("boot");
  const [job, setJob] = useState<Job | null>(null);
  const [failure, setFailure] = useState<{ message: string; input?: Input } | null>(null);
  const [lastInput, setLastInput] = useState<Input | null>(null);
  const [upload, setUpload] = useState<number | null>(null);
  const booted = useRef(false);
  const runId = useRef(0);

  /** Upload the file and start the analysis; the processing screen shows upload progress meanwhile. */
  const run = useCallback(
    (input: Input) => {
      const id = ++runId.current;
      setLastInput(input);
      setJob(null);
      setFailure(null);
      setUpload(0);
      startAnalysis(input, (p) => runId.current === id && setUpload(p))
        .then(async ({ id: jobId }) => {
          if (runId.current !== id) return;
          router.replace(`/studio?job=${jobId}`, { scroll: false });
          const j = await getJob(jobId);
          if (runId.current !== id) return;
          setUpload(null);
          setJob(j);
        })
        .catch((e: ApiError) => {
          if (runId.current !== id) return;
          setUpload(null);
          setFailure({ message: e.message, input });
          scene(SLATES.error, () => setMode("error"));
        });
    },
    [router, scene],
  );

  /* first load: ?job=…  |  ?upload=1 (file handed over from the landing page) */
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    const id = params.get("job");
    if (id) {
      getJob(id)
        .then((j) => {
          setJob(j);
          setMode(j.status === "done" ? "results" : j.status === "error" ? "error" : j.status === "running" ? "processing" : "new");
          if (j.status === "error") setFailure({ message: j.error || "Something went wrong." });
        })
        .catch((e: ApiError) => {
          setFailure({ message: e.message });
          setMode("error");
        });
      return;
    }
    const pending = params.get("upload") ? takePendingUpload() : null;
    if (pending) {
      setMode("processing");
      run(pending);
    } else setMode("new");
  }, [params, run]);

  /* poll a running job */
  useEffect(() => {
    if (mode !== "processing" || !job || job.status !== "running") return;
    let stop = false;
    const t = window.setInterval(async () => {
      try {
        const j = await getJob(job.id);
        if (stop) return;
        setJob(j);
        if (j.status === "done") scene(SLATES.results, () => setMode("results"));
        else if (j.status === "error") {
          setFailure({ message: j.error || "Something went wrong.", input: lastInput || undefined });
          scene(SLATES.error, () => setMode("error"));
        }
      } catch (e) {
        if (!stop && e instanceof ApiError && e.status === 404) {
          setFailure({ message: e.message });
          scene(SLATES.error, () => setMode("error"));
        }
      }
    }, 1000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [mode, job, scene, lastInput]);

  const begin = useCallback(
    (input: Input) =>
      scene(SLATES.processing, () => {
        setMode("processing");
        run(input);
      }),
    [run, scene],
  );

  const toNew = useCallback(() => {
    runId.current++;
    scene(SLATES.new, () => {
      setJob(null);
      setFailure(null);
      setUpload(null);
      setMode("new");
      router.replace("/studio", { scroll: false });
    });
  }, [router, scene]);

  useEffect(() => {
    if (mode === "new" || mode === "boot") setTC("00:00:00:00");
    if (mode === "error") setTC("--:--:--:--");
  }, [mode]);

  return (
    <main id="studio">
      <div className="aura" aria-hidden="true" />
      {mode === "new" && <NewView key="new" initial={lastInput} startWithLink={params.get("src") === "link"} onStart={begin} />}
      {mode === "processing" && (
        <ProcessingView
          key="processing"
          job={job}
          input={lastInput}
          upload={upload}
          onCancel={() => {
            if (job) cancelJob(job.id);
            toast("Analysis cancelled");
            toNew();
          }}
        />
      )}
      {mode === "results" && job?.result && <ResultsView key={`results-${job.id}`} job={job} onNew={toNew} />}
      {mode === "error" && (
        <ErrorView
          key="error"
          message={failure?.message || "Something went wrong."}
          isLink={!!failure?.input?.url}
          onRetry={failure?.input ? () => begin(failure.input!) : undefined}
          onNew={toNew}
        />
      )}
    </main>
  );
}

/* ───────────────────────── New analysis ───────────────────────── */
function NewView({ initial, startWithLink, onStart }: { initial: Input | null; startWithLink: boolean; onStart: (i: Input) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEnter(ref, "#newH", ".new .crumb, .new .lead, .new .card");
  const [file, setFile] = useState<File | null>(initial?.file || null);
  const [lang, setLang] = useState<Language>(initial?.language || "english");
  const [err, setErr] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [useLink, setUseLink] = useState(ALLOW_LINKS && (startWithLink || !!initial?.url));
  const [url, setUrl] = useState(initial?.url || "");

  const pick = (f: File | undefined | null) => {
    if (!f) return;
    const problem = checkFile(f);
    setErr(problem);
    setFile(problem ? null : f);
  };

  const analyze = () => {
    if (useLink) {
      if (!url.trim()) return setErr("Paste a YouTube link first.");
      if (!isUrl(url)) return setErr("That doesn't look like a link. Paste the full address, starting with https://");
      return onStart({ url: url.trim(), language: lang });
    }
    if (!file) return setErr("Choose a video or audio file first.");
    onStart({ file, language: lang });
  };

  return (
    <div className="view" ref={ref}>
      <div className="new">
        <div className="crumb mono">
          <span>Studio</span>
          <span>/</span>
          <b>New analysis</b>
        </div>
        <h1 className="display" id="newH">
          What should we <em>watch?</em>
        </h1>
        <p className="lead">Upload any video or recording. Long videos take a few minutes; you can keep this tab open while it works.</p>
        <div className="card paper">
          {useLink ? (
            <div className="link-mode">
              <label className="sr" htmlFor="newUrl">
                YouTube link
              </label>
              <div className="inp-big">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
                </svg>
                <input
                  id="newUrl"
                  placeholder="https://www.youtube.com/watch?v=…"
                  autoComplete="off"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && analyze()}
                />
              </div>
              <button type="button" className="switch-src" onClick={() => (setUseLink(false), setErr(null))}>
                Upload a file instead
              </button>
            </div>
          ) : (
          <div>
            <label
              className={`drop${over ? " over" : ""}`}
              htmlFor="fileIn"
              data-cursor="Drop"
              onDragEnter={(e) => (e.preventDefault(), setOver(true))}
              onDragOver={(e) => (e.preventDefault(), setOver(true))}
              onDragLeave={(e) => (e.preventDefault(), setOver(false))}
              onDrop={(e) => {
                e.preventDefault();
                setOver(false);
                pick(e.dataTransfer.files[0]);
              }}
            >
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
              </svg>
              <b>{file ? file.name : "Drop a video or audio file"}</b>
              <span>{file ? `${fmtSize(file.size)} · click to choose a different file` : `${FORMATS} and more · or click to choose`}</span>
              <span className="limit">Maximum size {MAX_UPLOAD_MB} MB</span>
            </label>
            <input type="file" id="fileIn" accept={ACCEPT} className="sr" onChange={(e) => pick(e.target.files?.[0])} />
            {ALLOW_LINKS && (
              <button type="button" className="switch-src" onClick={() => (setUseLink(true), setErr(null))}>
                or paste a YouTube link
              </button>
            )}
          </div>
          )}
          <div className="field-lab">
            Spoken language <span>What people speak in the video</span>
          </div>
          <div className="langs" role="radiogroup" aria-label="Spoken language">
            <button className="lang-opt" role="radio" aria-checked={lang === "english"} onClick={() => setLang("english")}>
              <b>
                English <i />
              </b>
              <span>Transcribed by Whisper.</span>
            </button>
            <button className="lang-opt" role="radio" aria-checked={lang === "hinglish"} onClick={() => setLang("hinglish")}>
              <b>
                Hinglish <i />
              </b>
              <span>Hindi and English mixed. Transcribed and translated to English by Sarvam AI.</span>
            </button>
          </div>
          {err && (
            <div className="err-inline" role="alert">
              <b>!</b>
              <span>{err}</span>
            </div>
          )}
          <div className="go-row">
            <span className="hint">You&apos;ll get a title, summary, action items, decisions, open questions, the full transcript and a chat.</span>
            <button className="go go-lg mag" data-cursor="Go" onClick={analyze}>
              Analyze video
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── Processing ───────────────────────── */
function ProcessingView({ job, input, upload, onCancel }: { job: Job | null; input: Input | null; upload: number | null; onCancel: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEnter(ref, ".proc-side h1", ".proc-screen, .proc-side > *");
  const canvas = useRef<HTMLCanvasElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const capRef = useRef<HTMLDivElement>(null);
  const elapsedRef = useRef<HTMLDivElement>(null);
  const lang: Language = job?.language || input?.language || "english";
  const stage = job ? job.stage : -1;
  const source = job ? job.source : input?.file?.name || input?.url || "";
  const uploading = !job && upload !== null && !!input?.file;
  const pct = Math.round((upload ?? 0) * 100);

  /* elapsed clock + waveform, interpolated between polls */
  const base = useRef({ at: performance.now(), elapsed: 0 });
  useEffect(() => {
    base.current = { at: performance.now(), elapsed: job?.elapsed ?? 0 };
  }, [job?.elapsed]);
  const progress = useRef(0);
  useEffect(() => {
    progress.current = stage < 0 ? 0.02 : clamp((stage + 0.5) / STAGE_NAMES.length);
  }, [stage]);

  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    let shown = 0;
    const draw = () => {
      const now = performance.now();
      const el = base.current.elapsed + (job?.status === "running" || !job ? (now - base.current.at) / 1000 : 0);
      const stamp = tc(el);
      if (elapsedRef.current) elapsedRef.current.textContent = stamp;
      setTC(stamp);
      shown += (progress.current - shown) * 0.04;
      const c = canvas.current;
      if (c && c.offsetParent) {
        const d = Math.min(2, devicePixelRatio || 1),
          r = c.getBoundingClientRect();
        const W = Math.round(r.width * d),
          H = Math.round(r.height * d);
        if (c.width !== W || c.height !== H) {
          c.width = W;
          c.height = H;
        }
        const x = c.getContext("2d")!;
        const t = (now - t0) / 1000;
        x.clearRect(0, 0, W, H);
        const n = 96,
          bw = W / n,
          mid = H * 0.46,
          scan = ((t * 0.16) % 1) * W;
        const g = x.createLinearGradient(0, 0, W, 0);
        g.addColorStop(0, "#EC954A");
        g.addColorStop(0.55, "#DE6A85");
        g.addColorStop(1, "#7B6BEF");
        for (let i = 0; i < n; i++) {
          const h = Math.max(2 * d, (BARS[i % BARS.length] * 0.75 + 0.25 * Math.sin(t * 3 + i * 0.3)) * H * 0.4);
          const xx = i * bw,
            done = xx / W < shown,
            near = Math.abs(xx - scan) < W * 0.05;
          x.fillStyle = done ? g : "#111114";
          x.globalAlpha = near ? 1 : done ? 0.9 : 0.1;
          x.beginPath();
          if (x.roundRect) x.roundRect(xx + bw * 0.25, mid - h / 2, bw * 0.5, h, bw * 0.25);
          else x.rect(xx + bw * 0.25, mid - h / 2, bw * 0.5, h);
          x.fill();
        }
        x.globalAlpha = 1;
        x.fillStyle = "#111114";
        x.fillRect(scan, 0, d, H);
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [job?.status, job]);

  /* caption crossfade when the stage changes */
  const caption = stage < 0 ? (uploading ? (pct >= 100 ? "Upload complete, starting…" : "Uploading your file…") : "Starting…") : stage === 1 && lang === "hinglish" ? "Translating Hinglish to English…" : CAPS[stage] || CAPS[0];
  useEffect(() => {
    const el = capRef.current;
    if (!el) return;
    if (reducedMotion()) {
      el.textContent = caption;
      return;
    }
    const tw = gsap.to(el, {
      opacity: 0,
      y: -8,
      duration: 0.3,
      onComplete: () => {
        el.textContent = caption;
        gsap.fromTo(el, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.5 });
      },
    });
    return () => void tw.kill();
  }, [caption]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = 1e6;
  }, [job?.logs.length]);

  return (
    <div className="view" ref={ref}>
      <div className="crumb mono">
        <span>Studio</span>
        <span>/</span>
        <b>Analyzing</b>
      </div>
      <div className="proc">
        <div className="proc-screen">
          <canvas ref={canvas} aria-hidden="true" />
          <div className="top mono">
            <span className="rec">
              <i />
              Working
            </span>
            <span className="src url">{prettySource(source)}</span>
          </div>
          <div className="cap" ref={capRef} aria-live="polite">
            {caption}
          </div>
        </div>
        <div className="proc-side">
          <div className="elapsed tnum" ref={elapsedRef}>
            00:00:00:00
          </div>
          {uploading && (
            <div className="upload-state">
              <div className="mono">
                <span>Uploading {input?.file ? `· ${fmtSize(input.file.size)}` : ""}</span>
                <b className="tnum">{pct}%</b>
              </div>
              <div className="upbar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
                <i style={{ width: `${pct}%` }} />
              </div>
            </div>
          )}
          <h1 className="display">
            Watching it, <em>so you don&apos;t have to.</em>
          </h1>
          <ol className="stages">
            {STAGE_NAMES.map((name, i) => {
              const info = job?.stages[i];
              const state = info?.state || (i === 0 && !job ? "running" : "waiting");
              return (
                <li className={`stage${state === "running" ? " run" : state === "done" ? " done" : ""}`} key={name}>
                  <span className="ic">
                    {state === "done" && (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <path d="m5 12 5 5 9-10" />
                      </svg>
                    )}
                  </span>
                  <span>
                    <b>{name}</b>
                    <small>{stageDetail(i, lang)}</small>
                  </span>
                  <span className="tm tnum">{state === "waiting" ? "—" : dur(info?.seconds)}</span>
                </li>
              );
            })}
          </ol>
          <details className="logd" open>
            <summary className="mono">Live log ▾</summary>
            <div className="log" ref={logRef} data-lenis-prevent>
              {(job?.logs.length ? job.logs : [uploading ? `Uploading ${input?.file?.name ?? "file"}… ${pct}%` : "Starting…"]).map((l, i) => (
                <div key={i}>
                  <b>›</b> {l}
                </div>
              ))}
            </div>
          </details>
          <div>
            <button className="ghost" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── Results ───────────────────────── */
type Msg = { role: "u" | "a"; text: string; miss?: boolean; pending?: boolean; failed?: boolean };

function ResultsView({ job, onNew }: { job: Job; onNew: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEnter(ref, "#resTitle", ".res-head .meta, .stats, .res-actions, .res-body > div > *, .askp");
  const R = job.result!;
  const summary = useMemo(() => parseSummary(R.summary), [R.summary]);
  const actions = useMemo(() => parseActions(R.action_items), [R.action_items]);
  const decisions = useMemo(() => parsePoints(R.key_decisions), [R.key_decisions]);
  const questions = useMemo(() => parsePoints(R.open_questions), [R.open_questions]);
  const wordCount = countWords(R.transcript);
  const title = cleanTitle(R.title);

  const [tab, setTab] = useState<"overview" | "insights" | "transcript">("overview");
  const [done, setDone] = useState<Set<number>>(new Set());
  const [q, setQ] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [askIn, setAskIn] = useState("");
  const [sheet, setSheet] = useState(false);
  const tabsRef = useRef<HTMLDivElement>(null);
  const inkRef = useRef<HTMLSpanElement>(null);
  const txRef = useRef<HTMLDivElement>(null);
  const msgsRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const firstTab = useRef(true);

  useEffect(() => setTC(tc(job.elapsed)), [job.elapsed]);

  /* stats count up */
  useEffect(() => {
    if (reducedMotion()) return;
    const els = Array.from(ref.current!.querySelectorAll<HTMLElement>(".stat b"));
    const tws = els.map((b) => {
      const n = +b.dataset.n!,
        o = { v: 0 };
      return gsap.to(o, { v: n, duration: 1.4, ease: "power2.out", delay: 0.3, onUpdate: () => void (b.textContent = Math.round(o.v).toLocaleString()) });
    });
    return () => tws.forEach((t) => t.kill());
  }, []);

  /* sliding tab ink + panel entrance */
  useEffect(() => {
    const btn = tabsRef.current?.querySelector<HTMLElement>(`[data-t="${tab}"]`);
    if (btn && inkRef.current) gsap.to(inkRef.current, { x: btn.offsetLeft, width: btn.offsetWidth, duration: firstTab.current ? 0 : 0.6, ease: "expo.out" });
    if (!firstTab.current && panelRef.current && !reducedMotion())
      gsap.from(panelRef.current.children, { opacity: 0, y: 16, filter: "blur(6px)", duration: 0.7, ease: "expo.out", stagger: 0.05, clearProps: "filter,opacity,transform" });
    firstTab.current = false;
  }, [tab]);

  /* transcript search */
  const tx = useMemo(() => {
    const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
    if (!q.trim()) return { html: esc(R.transcript), label: `${wordCount.toLocaleString()} words` };
    const re = new RegExp(q.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    let n = 0;
    const html = esc(R.transcript).replace(re, (m) => (n++, `<mark>${m}</mark>`));
    return { html, label: n ? `${n} match${n === 1 ? "" : "es"}` : "No matches" };
  }, [q, R.transcript, wordCount]);
  useEffect(() => {
    const first = txRef.current?.querySelector<HTMLElement>("mark");
    if (first && txRef.current) txRef.current.scrollTop = first.offsetTop - 80;
  }, [tx.html]);

  /* chat */
  useEffect(() => {
    if (msgsRef.current) msgsRef.current.scrollTop = 1e6;
  }, [msgs]);
  useEffect(() => {
    const l = getLenis();
    if (sheet) l?.stop();
    else l?.start();
    return () => l?.start();
  }, [sheet]);

  const send = async (question: string) => {
    question = question.trim();
    if (!question) return;
    setAskIn("");
    setMsgs((m) => [...m, { role: "u", text: question }, { role: "a", text: "", pending: true }]);
    let answer = "",
      failed = false;
    try {
      answer = (await askVideo(job.id, question)).answer.trim();
    } catch (e) {
      failed = true;
      answer = e instanceof Error ? e.message : "Couldn't get an answer.";
    }
    const miss = !failed && answer.startsWith(NOT_FOUND.slice(0, 40));
    const parts = answer.split(" ");
    let i = 0;
    const t = window.setInterval(() => {
      i += 1;
      const shown = parts.slice(0, i).join(" ");
      setMsgs((m) => {
        const copy = m.slice();
        copy[copy.length - 1] = { role: "a", text: shown, miss, failed };
        return copy;
      });
      if (i >= parts.length) clearInterval(t);
    }, 38);
  };

  const stats: [number, string][] = [
    [wordCount, "words transcribed"],
    [Math.max(1, Math.round(wordCount / 230)), "min to read"],
    [actions.length, "action items"],
    [decisions.length, "decisions"],
    [questions.length, "open questions"],
  ];
  const insightsCount = actions.length + decisions.length + questions.length;
  const raw = (label: string, text: string) => (
    <details className="raw">
      <summary>Show the model&apos;s raw output</summary>
      <pre aria-label={label}>{text}</pre>
    </details>
  );

  return (
    <div className="view" ref={ref}>
      <div className="res-head">
        <div className="meta mono">
          <span className="okdot">Analysis complete</span>
          <span>{job.language === "hinglish" ? "Hinglish · Sarvam AI" : "English · Whisper"}</span>
          <span className="url">{prettySource(job.source)}</span>
        </div>
        <h1 className="display" id="resTitle">
          {title}
        </h1>
        <div className="stats">
          {stats.map(([n, l]) => (
            <div className="stat" key={l}>
              <b className="tnum" data-n={n}>
                {n.toLocaleString()}
              </b>
              <span>{l}</span>
            </div>
          ))}
        </div>
        <div className="res-actions">
          <button className="ghost" onClick={() => copyText(`${title}\n\n${summary.length ? outlineText(summary) : R.summary}`)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect x="9" y="9" width="11" height="11" rx="2" />
              <path d="M5 15V5a1 1 0 0 1 1-1h9" />
            </svg>
            Copy summary
          </button>
          <button className="ghost" onClick={onNew}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v5h5" />
            </svg>
            Start over
          </button>
        </div>
      </div>

      <div className="res-body">
        <div>
          <div className="rtabs" role="tablist" ref={tabsRef}>
            <span className="ink" ref={inkRef} />
            <button role="tab" data-t="overview" aria-selected={tab === "overview"} onClick={() => setTab("overview")}>
              Overview
            </button>
            <button role="tab" data-t="insights" aria-selected={tab === "insights"} onClick={() => setTab("insights")}>
              Insights <em>{insightsCount}</em>
            </button>
            <button role="tab" data-t="transcript" aria-selected={tab === "transcript"} onClick={() => setTab("transcript")}>
              Transcript
            </button>
          </div>

          <div className="panel" ref={panelRef} key={tab}>
            {tab === "overview" && (
              <>
                <div className="sec-h">
                  <h3>Summary</h3>
                  <span className="mono">Executive summary</span>
                </div>
                {summary.length ? (
                  summary.map((sec, si) => (
                    <div className="sum-sec" key={si}>
                      {sec.heading && <div className="sum-h mono">{sec.heading}</div>}
                      <ul className="sum">
                        {sec.items.map((p, i) => (
                          <li key={i}>
                            <PointBody p={p} />
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))
                ) : (
                  <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{R.summary}</p>
                )}
                <div className="glance">
                  {(
                    [
                      [actions.length, "Action items"],
                      [decisions.length, "Decisions"],
                      [questions.length, "Open questions"],
                    ] as const
                  ).map(([n, l]) => (
                    <button key={l} data-cursor="Open" onClick={() => setTab("insights")}>
                      <b>{n}</b>
                      <span>{l} →</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {tab === "insights" && (
              <>
                <div className="sec-h">
                  <h3>Action items</h3>
                  <span className="mono">{actions.length ? `${actions.length - done.size} of ${actions.length} open` : "None"}</span>
                </div>
                {actions.length ? (
                  <div className="acts">
                    <div className="act hd mono">
                      <span />
                      <span>Task</span>
                      <span>Owner</span>
                      <span>Deadline</span>
                    </div>
                    {actions.map((a, i) => {
                      const isDone = done.has(i);
                      return (
                        <div className={`act${isDone ? " done" : ""}`} key={i}>
                          <button
                            className="chk"
                            aria-label={`Mark done: ${a.task}`}
                            aria-pressed={isDone}
                            onClick={() =>
                              setDone((d) => {
                                const n = new Set(d);
                                if (n.has(i)) n.delete(i);
                                else n.add(i);
                                return n;
                              })
                            }
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                              <path d="m5 12 5 5 9-10" />
                            </svg>
                          </button>
                          <span className="task">{a.task}</span>
                          <span className={`who${a.owner === "Not specified" ? " ns" : ""}`}>{a.owner}</span>
                          <span className={`when${a.due === "Not specified" ? " ns" : ""}`}>{a.due}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="miss-note">{isNone(R.action_items) ? "No action items were mentioned." : R.action_items}</p>
                )}
                {raw("Action items, raw", R.action_items)}

                <div className="sec-h" style={{ marginTop: 14 }}>
                  <h3>Key decisions</h3>
                  <span className="mono">{decisions.length} made</span>
                </div>
                {decisions.length ? (
                  <ul className="plist">
                    {decisions.map((d, i) => (
                      <li key={i}>
                        <span className="tag dec">Decision</span>
                        <PointBody p={d} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="miss-note">No decisions were recorded.</p>
                )}

                <div className="sec-h" style={{ marginTop: 14 }}>
                  <h3>Open questions</h3>
                  <span className="mono">{questions.length} unresolved</span>
                </div>
                {questions.length ? (
                  <ul className="plist">
                    {questions.map((d, i) => (
                      <li key={i}>
                        <span className="tag q">Question</span>
                        <PointBody p={d} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="miss-note">Nothing was left open.</p>
                )}
              </>
            )}

            {tab === "transcript" && (
              <>
                <div className="tx-tools">
                  <label className="sr" htmlFor="txSearch">
                    Search transcript
                  </label>
                  <div className="inp-big">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <circle cx="11" cy="11" r="6.5" />
                      <path d="m16 16 4 4" />
                    </svg>
                    <input id="txSearch" placeholder="Search the transcript" autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} />
                  </div>
                  <span className="cnt mono">{tx.label}</span>
                  <button className="ghost" onClick={() => copyText(R.transcript)}>
                    Copy
                  </button>
                </div>
                <div className="tx" ref={txRef} data-lenis-prevent dangerouslySetInnerHTML={{ __html: tx.html }} />
              </>
            )}
          </div>
        </div>

        <aside className={`askp${sheet ? " open" : ""}`} aria-label="Chat with this video">
          <div className="hd">
            <div>
              <b>
                Ask this <em>video</em>
              </b>
              <div className="mono">Answers from the transcript only</div>
            </div>
            <button className="close" aria-label="Close chat" onClick={() => setSheet(false)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </div>
          <div className="msgs" ref={msgsRef} data-lenis-prevent>
            {!msgs.length && (
              <div className="empty">
                <span>Try one of these, or type your own.</span>
                <div className="sugg">
                  {["What are the main takeaways?", "What are the next steps?", "Who is responsible for what?", "What questions were left open?"].map((s) => (
                    <button type="button" key={s} onClick={() => send(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {msgs.map((m, i) =>
              m.role === "u" ? (
                <div className="msg u" key={i}>
                  {m.text}
                </div>
              ) : (
                <div className={`msg a${m.miss || m.failed ? " miss" : ""}`} key={i}>
                  <span className="lab mono">{m.failed ? "Couldn't answer" : m.miss ? "Not in this video" : "From the transcript"}</span>
                  {m.pending ? (
                    <span className="typing">
                      <i />
                      <i />
                      <i />
                    </span>
                  ) : (
                    <span style={{ whiteSpace: "pre-wrap" }}>
                      {m.text.split(/\*\*(.+?)\*\*/g).map((part, k) => (k % 2 ? <strong key={k}>{part}</strong> : part))}
                    </span>
                  )}
                </div>
              ),
            )}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(askIn);
            }}
          >
            <label className="sr" htmlFor="askIn">
              Your question
            </label>
            <input id="askIn" placeholder="Ask a question about this video…" autoComplete="off" value={askIn} onChange={(e) => setAskIn(e.target.value)} />
            <button className="send" aria-label="Send">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </button>
          </form>
        </aside>
        {sheet && <div className="scrim" onClick={() => setSheet(false)} />}
        <button className="pill pill-ink ask-fab" onClick={() => setSheet(true)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 5h16v11H9l-5 4z" />
          </svg>
          Ask this video
        </button>
      </div>
    </div>
  );
}

function PointBody({ p }: { p: Point }) {
  return (
    <span className="pt">
      <span>{p.text}</span>
      {p.children.length > 0 && (
        <ul className="sub">
          {p.children.map((c, i) => (
            <li key={i}>{c}</li>
          ))}
        </ul>
      )}
    </span>
  );
}

/* ───────────────────────── Error ───────────────────────── */
function ErrorView({ message, isLink, onRetry, onNew }: { message: string; isLink: boolean; onRetry?: () => void; onNew: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEnter(ref, ".errv h1", ".errv > *");
  const noise = useRef<HTMLCanvasElement>(null);
  const offline = message.startsWith("Can't reach");
  const tooBig = /too large|limit is/i.test(message);

  useEffect(() => {
    let t = 0;
    const loop = () => {
      const c = noise.current;
      if (!c) return;
      c.width = 160;
      c.height = 70;
      const x = c.getContext("2d")!;
      const d = x.createImageData(160, 70);
      for (let i = 0; i < d.data.length; i += 4) {
        const v = 80 + Math.random() * 175;
        d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
        d.data[i + 3] = 255;
      }
      x.putImageData(d, 0, 0);
      t = window.setTimeout(loop, 90);
    };
    loop();
    return () => clearTimeout(t);
  }, []);

  const [h, rest] = offline
    ? ["We can't reach", "the Afterword server."]
    : isLink
      ? ["We couldn't get the audio", "from that link."]
      : tooBig
        ? ["That file is", "too large."]
        : ["We couldn't process", "that file."];

  return (
    <div className="view" ref={ref}>
      <div className="errv">
        <div className="crumb mono">
          <span>Studio</span>
          <span>/</span>
          <b>Something went wrong</b>
        </div>
        <div className="screen-err">
          <canvas className="noise" ref={noise} aria-hidden="true" />
          <span className="m">No signal.</span>
        </div>
        <h1 className="display">
          {h} <em>{rest}</em>
        </h1>
        <p>
          {offline
            ? "The analysis server isn't answering. On the free plan it sleeps when idle and takes about a minute to wake up, so try again shortly."
            : isLink
              ? "The video may be private, age-restricted or removed, or YouTube may have blocked this server. Download it and upload the file instead."
              : tooBig
              ? "Trim the video or export it at a lower quality, then upload it again. Audio-only files (MP3, M4A) are much smaller."
              : "The file may be damaged or in a format FFmpeg can't read. Try exporting it again as MP4 or MP3."}
        </p>
        <pre>{message}</pre>
        <div className="res-actions">
          {onRetry && (
            <button className="go" onClick={onRetry}>
              Try again
            </button>
          )}
          <button className="ghost" onClick={onNew}>
            {isLink ? "Upload a file instead" : "Choose another file"}
          </button>
        </div>
      </div>
    </div>
  );
}
