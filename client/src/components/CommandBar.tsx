"use client";

import { useRef, useState } from "react";
import { gsap } from "@/lib/motion";
import { ACCEPT, FORMATS, MAX_UPLOAD_MB, checkFile, fmtSize, setPendingUpload } from "@/lib/upload";
import { SLATES, useScene } from "./Shell";
import type { Language } from "@/lib/api";

/** The "choose a file · language · Analyze" bar used in the hero and the final call to action. */
export function CommandBar({ id, note }: { id: string; note?: string }) {
  const { go } = useScene();
  const [lang, setLang] = useState<Language>("english");
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState("");
  const [over, setOver] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const input = useRef<HTMLInputElement>(null);

  const shake = () => form.current && gsap.fromTo(form.current, { x: -8 }, { x: 0, duration: 0.7, ease: "elastic.out(1,.3)" });

  const pick = (f: File | undefined | null) => {
    if (!f) return;
    const problem = checkFile(f);
    if (problem) {
      setFile(null);
      setErr(problem);
      shake();
      return;
    }
    setErr("");
    setFile(f);
  };

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!file) {
      setErr("Choose a video or audio file first.");
      shake();
      input.current?.click();
      return;
    }
    setPendingUpload({ file, language: lang });
    go(`/studio?upload=1&lang=${lang}`, SLATES.processing);
  };

  return (
    <>
      <form
        ref={form}
        className={`cmd${over ? " over" : ""}`}
        onSubmit={submit}
        noValidate
        onDragEnter={(e) => (e.preventDefault(), setOver(true))}
        onDragOver={(e) => (e.preventDefault(), setOver(true))}
        onDragLeave={(e) => (e.preventDefault(), setOver(false))}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          pick(e.dataTransfer.files[0]);
        }}
      >
        <label className="field pick" htmlFor={id} data-cursor="Choose">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
          </svg>
          <span className={file ? "picked" : ""}>{file ? `${file.name} · ${fmtSize(file.size)}` : "Choose or drop a video"}</span>
        </label>
        <input ref={input} id={id} type="file" accept={ACCEPT} className="sr" onChange={(e) => pick(e.target.files?.[0])} />
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
      <div className="cmd-note">
        {err ? <span className="cmd-err">{err}</span> : <span>{note ?? `${FORMATS} and more · up to ${MAX_UPLOAD_MB} MB`}</span>}
      </div>
    </>
  );
}
