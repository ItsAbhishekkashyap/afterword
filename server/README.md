# Afterword · server

FastAPI layer over the video pipeline: yt-dlp / FFmpeg → Whisper (or Sarvam AI for Hinglish) → Mistral summaries and extraction → Chroma RAG chat.

## Engines

| Setting | Default (light, cloud) | Local alternative |
|---|---|---|
| `TRANSCRIBE_ENGINE` | `groq`: Whisper large-v3 on Groq, needs `GROQ_API_KEY` | `local`: openai-whisper on this machine (`WHISPER_MODEL`, default `base`) |
| `EMBEDDINGS` | `mistral`: `mistral-embed`, uses `MISTRAL_API_KEY` | `local`: all-MiniLM-L6-v2 via sentence-transformers |

The defaults need no PyTorch and run in about 120 MB of RAM. For the local engines, `pip install -r requirements-local.txt` (about 2 GB of RAM at runtime).
Hinglish always uses Sarvam AI. Every video gets its own Chroma collection, so the chat only searches that video.

## Run locally

Requires Python 3.11 and FFmpeg on your PATH.

```bash
python -m venv .venv
.venv\Scripts\activate          # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env            # add MISTRAL_API_KEY, GROQ_API_KEY and SARVAM_API_KEY
python -X utf8 -m uvicorn api.main:app --reload --port 8000
```

Startup takes a few seconds with the default engines.

## API

| Method | Path | Body | Returns |
|---|---|---|---|
| `GET` | `/api/health` | | `{ ok }` |
| `POST` | `/api/analyze` | form: `url` **or** `file`, `language` (`english` / `hinglish`) | `{ id }` |
| `GET` | `/api/jobs/{id}` | | status, current stage, stage timings, log lines, result |
| `DELETE` | `/api/jobs/{id}` | | cancels the job |
| `POST` | `/api/jobs/{id}/ask` | JSON `{ question }` | `{ answer }` |

Jobs live in memory, so a restart clears them.

## CLI

`python main.py` runs the same pipeline in the terminal.
