"""
HTTP layer for the Next.js frontend (web/).

This file only *calls* the existing pipeline functions in core/ and utils/,
in the same order app.py does. It adds:
  - background jobs, so the browser can show progress while a video is processed
  - the pipeline's own print() output, streamed back to the UI as a live log
  - a chat endpoint that reuses the RAG chain built for each job

Run from the server/ folder:
    python -X utf8 -m uvicorn api.main:app --reload --port 8000
"""

import io
import os
import sys
import threading
import time
import uuid
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

load_dotenv()

from utils.audio_processor import DOWNLOAD_DIR, process_input  # noqa: E402
from core.transcriber import transcribe_all  # noqa: E402
from core.summarizer import summarize, generate_title  # noqa: E402
from core.extractor import extract_action_items, extract_key_decisions, extract_questions  # noqa: E402
from core.rag_engine import build_rag_chain, ask_question  # noqa: E402

STAGES = [
    "Downloading & processing audio",
    "Transcribing audio",
    "Generating summary & title",
    "Extracting insights",
    "Building chat index",
]
MAX_LOG_LINES = 400
# Largest upload accepted, in MB (keep in sync with the client's NEXT_PUBLIC_MAX_UPLOAD_MB).
MAX_UPLOAD_MB = int(os.getenv("MAX_UPLOAD_MB", "500"))
# YouTube/web links (downloaded with yt-dlp). Off by default: cloud servers are usually blocked by
# YouTube. Turn on for a local server (ALLOW_LINKS=true), where your home connection is used.
ALLOW_LINKS = os.getenv("ALLOW_LINKS", "false").strip().lower() in ("1", "true", "yes", "on")


class Job:
    def __init__(self, source: str, language: str, label: str):
        self.id = uuid.uuid4().hex[:12]
        self.source = source
        self.language = language
        self.label = label
        self.status = "running"  # running | done | error | cancelled
        self.stage = 0
        self.stage_started = [None] * len(STAGES)
        self.stage_finished = [None] * len(STAGES)
        self.logs: list[str] = []
        self.error: Optional[str] = None
        self.result: Optional[dict] = None
        self.rag_chain = None
        self.created = time.time()
        self.finished: Optional[float] = None
        self.lock = threading.Lock()

    def log(self, line: str):
        line = line.rstrip()
        if not line:
            return
        with self.lock:
            self.logs.append(line)
            if len(self.logs) > MAX_LOG_LINES:
                self.logs = self.logs[-MAX_LOG_LINES:]

    def to_dict(self) -> dict:
        now = time.time()
        with self.lock:
            return {
                "id": self.id,
                "status": self.status,
                "source": self.label,
                "language": self.language,
                "stage": self.stage,
                "stages": [
                    {
                        "name": name,
                        "seconds": (
                            round((self.stage_finished[i] or now) - self.stage_started[i], 1)
                            if self.stage_started[i]
                            else None
                        ),
                        "state": (
                            "done" if self.stage_finished[i]
                            else "running" if self.stage_started[i] and self.status == "running"
                            else "waiting"
                        ),
                    }
                    for i, name in enumerate(STAGES)
                ],
                "logs": list(self.logs),
                "elapsed": round((self.finished or now) - self.created, 1),
                "error": self.error,
                "result": self.result,
            }


JOBS: dict[str, Job] = {}
_local = threading.local()


class _JobStdout(io.TextIOBase):
    """Sends print() output from a job's worker thread to that job's log, and still to the console."""

    def __init__(self, real):
        self.real = real
        self._buf = threading.local()

    def write(self, s):
        self.real.write(s)
        job = getattr(_local, "job", None)
        if job is not None:
            pending = getattr(self._buf, "text", "") + s
            *lines, rest = pending.split("\n")
            for line in lines:
                job.log(line)
            self._buf.text = rest
        return len(s)

    def flush(self):
        self.real.flush()

    def isatty(self):
        return False

    @property
    def encoding(self):
        return getattr(self.real, "encoding", "utf-8")


sys.stdout = _JobStdout(sys.stdout)


def _run(job: Job):
    _local.job = job

    def stage(i: int):
        now = time.time()
        with job.lock:
            if i > 0 and job.stage_started[i - 1] and not job.stage_finished[i - 1]:
                job.stage_finished[i - 1] = now
            job.stage = i
            job.stage_started[i] = now

    def alive() -> bool:
        return job.status == "running"

    try:
        # Same order as app.py
        stage(0)
        chunks = process_input(job.source)
        if not alive():
            return
        stage(1)
        transcript = transcribe_all(chunks, job.language)
        if not alive():
            return
        stage(2)
        title = generate_title(transcript)
        summary = summarize(transcript)
        if not alive():
            return
        stage(3)
        action_items = extract_action_items(transcript)
        decisions = extract_key_decisions(transcript)
        questions = extract_questions(transcript)
        if not alive():
            return
        stage(4)
        rag_chain = build_rag_chain(transcript)
        with job.lock:
            job.stage_finished[4] = time.time()
            job.rag_chain = rag_chain
            job.result = {
                "title": title,
                "transcript": transcript,
                "summary": summary,
                "action_items": action_items,
                "key_decisions": decisions,
                "open_questions": questions,
            }
            job.status = "done"
            job.finished = time.time()
    except Exception as e:  # surfaced to the UI as-is, like st.error(str(e)) in app.py
        with job.lock:
            if job.status == "running":
                job.status = "error"
                job.error = str(e) or e.__class__.__name__
                job.finished = time.time()
        job.log(f"ERROR: {job.error}")
    finally:
        _local.job = None


app = FastAPI(title="Afterword API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",") if o.strip()],
    allow_origin_regex=os.getenv("CORS_ORIGIN_REGEX") or None,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    return {"ok": True}


@app.post("/api/analyze")
async def analyze(
    language: str = Form("english"),
    url: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
):
    language = language.lower().strip()
    if language not in ("english", "hinglish"):
        raise HTTPException(400, "Language must be English or Hinglish.")

    if file is not None and file.filename:
        os.makedirs(DOWNLOAD_DIR, exist_ok=True)
        safe = os.path.basename(file.filename).replace(" ", "_")
        path = os.path.join(DOWNLOAD_DIR, f"{uuid.uuid4().hex[:8]}_{safe}")
        size = 0
        with open(path, "wb") as out:
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > MAX_UPLOAD_MB * 1024 * 1024:
                    out.close()
                    os.remove(path)
                    raise HTTPException(413, f"That file is too large. The limit is {MAX_UPLOAD_MB} MB.")
                out.write(chunk)
        if size == 0:
            os.remove(path)
            raise HTTPException(400, "That file is empty.")
        source, label = path, file.filename
    elif url and url.strip():
        if not ALLOW_LINKS:
            raise HTTPException(400, "Links are turned off on this server. Upload the video file instead.")
        source = url.strip()
        if not source.startswith(("http://", "https://")):
            raise HTTPException(400, "That doesn't look like a link. Paste the full address, starting with https://")
        label = source
    else:
        raise HTTPException(400, "Choose a video or audio file first.")

    job = Job(source, language, label)
    JOBS[job.id] = job
    threading.Thread(target=_run, args=(job,), daemon=True).start()
    return {"id": job.id}


@app.get("/api/jobs/{job_id}")
def get_job(job_id: str):
    job = JOBS.get(job_id)
    if not job:
        raise HTTPException(404, "This analysis no longer exists. The server may have restarted.")
    return job.to_dict()


@app.delete("/api/jobs/{job_id}")
def cancel_job(job_id: str):
    job = JOBS.get(job_id)
    if not job:
        raise HTTPException(404, "Analysis not found.")
    with job.lock:
        if job.status == "running":
            job.status = "cancelled"
            job.finished = time.time()
    return {"ok": True}


class AskBody(BaseModel):
    question: str


@app.post("/api/jobs/{job_id}/ask")
def ask(job_id: str, body: AskBody):
    job = JOBS.get(job_id)
    if not job:
        raise HTTPException(404, "This analysis no longer exists. The server may have restarted.")
    if job.status != "done" or job.rag_chain is None:
        raise HTTPException(409, "The chat is ready once the analysis finishes.")
    question = body.question.strip()
    if not question:
        raise HTTPException(400, "Type a question first.")
    return {"answer": ask_question(job.rag_chain, question)}
