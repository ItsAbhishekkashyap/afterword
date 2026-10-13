# Afterword

**Every video, remembered.** Paste a YouTube link or upload a recording and get the transcript, a summary, action items, decisions and open questions, plus a chat that answers only from what was said. Works with English and Hinglish.

```
afterword/
├── client/   Next.js website (Vercel)
└── server/   FastAPI + video pipeline (Render)
```

## How it works

1. **Listen**: yt-dlp downloads the audio (or FFmpeg converts your file) and cuts it into 10-minute pieces.
2. **Transcribe**: Whisper for English; Sarvam AI for Hinglish, translated to English.
3. **Summarise**: Mistral reads the transcript in 3,000-character parts and merges the summaries.
4. **Extract**: separate passes for action items, decisions and open questions.
5. **Remember**: the transcript is indexed in Chroma; each question uses the 4 closest passages.

## Run locally

```bash
# 1. API (needs Python 3.11 + FFmpeg)
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

**Server on Render**: New → Blueprint → pick this repo. `render.yaml` builds `server/` with Docker (FFmpeg, CPU PyTorch, Whisper and the embedding model are baked into the image). Set `MISTRAL_API_KEY`, `SARVAM_API_KEY` and `CORS_ORIGINS` (your Vercel URL). Whisper needs at least 2 GB of RAM, so use the Standard plan or higher.

**Client on Vercel**: New Project → import this repo → set **Root Directory** to `client` → add `NEXT_PUBLIC_API_URL` (your Render URL) and optionally `NEXT_PUBLIC_SITE_URL` → Deploy.

## Tech

Next.js 16, React 19, Tailwind CSS 4, GSAP, Lenis · FastAPI, OpenAI Whisper, Sarvam AI, Mistral (LangChain), Chroma, sentence-transformers, yt-dlp, FFmpeg.
