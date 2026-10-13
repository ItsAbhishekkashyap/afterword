# Afterword · client

Next.js 16 website: the landing page and the studio (`/studio`) that talks to the API in `../server`.

```bash
npm install
cp .env.example .env.local   # NEXT_PUBLIC_API_URL=http://localhost:8000
npm run dev                  # http://localhost:3000
```

| Env var | Purpose |
|---|---|
| `NEXT_PUBLIC_API_URL` | URL of the Afterword API (Render in production) |
| `NEXT_PUBLIC_MAX_UPLOAD_MB` | Largest upload the site accepts, in MB (default 500; match the server's `MAX_UPLOAD_MB`) |
| `NEXT_PUBLIC_SITE_URL` | Public URL of this site, for SEO tags (falls back to the Vercel URL) |

On Vercel, set **Root Directory** to `client`.

Landing page footage: Pexels (free to use).
