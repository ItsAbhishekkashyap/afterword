# Afterword · server

FastAPI layer over the video pipeline: yt-dlp / FFmpeg → Whisper (or Sarvam AI for Hinglish) → Mistral summaries and extraction → Chroma RAG chat.

## Run locally

Requires Python 3.11 and FFmpeg on your PATH.

```bash
python -m venv .venv
.venv\Scripts\activate          # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env            # add MISTRAL_API_KEY and SARVAM_API_KEY
python -X utf8 -m uvicorn api.main:app --reload --port 8000
```

The first start takes about a minute while PyTorch and Whisper load.

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
