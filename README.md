# Afterword

**Every video, remembered.** Upload any video or recording (up to 500 MB) and get the transcript, a summary, action items, decisions and open questions, plus a chat that answers only from what was said. Works with English and Hinglish.

```
afterword/
├── client/   Next.js website (Vercel)
└── server/   FastAPI + video pipeline (Render)
```

## How it works

1. **Listen**: FFmpeg extracts the audio from your upload and cuts it into 10-minute pieces.
2. **Transcribe**: Whisper large-v3 (hosted on Groq) for English; Sarvam AI for Hinglish, translated to English.
3. **Summarise**: Mistral reads the transcript in 3,000-character parts and merges the summaries.
4. **Extract**: separate passes for action items, decisions and open questions.
5. **Remember**: the transcript is embedded with Mistral and indexed in Chroma; each question uses the 4 closest passages.

## Run locally

```bash
# 1. API (needs Python 3.11 + FFmpeg; keys: Mistral, Groq, Sarvam)
cd server
pip install -r requirements.txt
cp .env.example .env        # add your keys
python -X utf8 -m uvicorn api.main:app --port 8000

# 2. Website (in a second terminal)
cd client
npm install
cp .env.example .env.local  # NEXT_PUBLIC_API_URL=http://localhost:8000
npm run dev
```

Open http://localhost:3000.

## Deploy

**Server on Render (free plan)**: New → Blueprint → pick this repo. `render.yaml` builds `server/` with Docker (Python + FFmpeg; about 120 MB of RAM at idle, so it fits the free 512 MB instance). Set `MISTRAL_API_KEY`, `GROQ_API_KEY` (free at console.groq.com), `SARVAM_API_KEY` and `CORS_ORIGINS` (your Vercel URL). Free instances sleep after 15 minutes without traffic, so the first request after a pause takes about a minute.

The website takes file uploads only (up to `MAX_UPLOAD_MB`, default 500 MB, set on both client and server).

**YouTube links on your own PC.** YouTube blocks cloud servers, so links are off in production. Locally, set `ALLOW_LINKS=true` in `server/.env` and `NEXT_PUBLIC_ALLOW_LINKS=true` in `client/.env.local`; an "or paste a YouTube link" option then appears next to the upload box, and yt-dlp downloads through your home connection.

**Client on Vercel**: New Project → import this repo → set **Root Directory** to `client` → add `NEXT_PUBLIC_API_URL` (your Render URL) and optionally `NEXT_PUBLIC_SITE_URL` → Deploy.

## Tech

Next.js 16, React 19, Tailwind CSS 4, GSAP, Lenis · FastAPI, Whisper large-v3 on Groq, Sarvam AI, Mistral (LangChain + embeddings), Chroma, yt-dlp, FFmpeg.
