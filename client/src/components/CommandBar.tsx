"use client";

import { useState } from "react";
import { gsap } from "@/lib/motion";
import { SLATES, useScene } from "./Shell";
import type { Language } from "@/lib/api";

/** A short public talk (TED, ~10 min) used by "Try a sample link". */
export const SAMPLE_URL = "https://www.youtube.com/watch?v=eIho2S0ZahI";
export const isUrl = (v: string) => /^https?:\/\/\S+\.\S+/.test(v.trim());

/** The "paste a link · language · Analyze" bar used in the hero and the final call to action. */
export function CommandBar({ id, note, withExtras = false }: { id: string; note: string; withExtras?: boolean }) {
  const { go } = useScene();
  const [lang, setLang] = useState<Language>("english");
  const [url, setUrl] = useState("");
  const [err, setErr] = useState("");

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const v = url.trim();
    if (!isUrl(v)) {
      setErr(v ? "That doesn't look like a link. It should start with https://" : "Paste a link first.");
      gsap.fromTo(e.currentTarget, { x: -8 }, { x: 0, duration: 0.7, ease: "elastic.out(1,.3)" });
      return;
    }
    setErr("");
    go(`/studio?url=${encodeURIComponent(v)}&lang=${lang}`, SLATES.processing);
  };

  const typeSample = () => {
    let k = 0;
    const t = setInterval(() => {
      setUrl(SAMPLE_URL.slice(0, ++k));
      if (k >= SAMPLE_URL.length) clearInterval(t);
    }, 14);
  };

  return (
    <>
      <form className="cmd" onSubmit={submit} noValidate>
        <div className="field">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
          </svg>
          <label className="sr" htmlFor={id}>
            YouTube link
          </label>
          <input id={id} placeholder="Paste a YouTube link" autoComplete="off" value={url} onChange={(e) => setUrl(e.target.value)} />
        </div>
        <div className="seg" role="group" aria-label="Spoken language">
          {(["english", "hinglish"] as const).map((l) => (
            <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)}>
              {l === "english" ? "English" : "Hinglish"}
            </button>
          ))}
        </div>
        <button className="go mag" type="submit" data-cursor="Go">
          Analyze
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>
      </form>
      <div className="cmd-note" style={withExtras ? { marginTop: 12 } : undefined}>
        {err ? <span className="cmd-err">{err}</span> : <span>{note}</span>}
        {withExtras && (
          <>
            <button type="button" onClick={() => go("/studio?src=file", SLATES.new)}>
              Upload a recording
            </button>
            <button type="button" onClick={typeSample}>
              Try a sample link
            </button>
          </>
        )}
      </div>
    </>
  );
}
