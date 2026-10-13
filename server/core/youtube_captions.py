"""
Fallback for YouTube links when the server can't download the audio
(YouTube often blocks cloud servers with "Sign in to confirm you're not a bot").

Supadata fetches the video's transcript from their side: YouTube's own captions when
they exist, or an AI transcript otherwise. Free plan: 100 credits/month, no card.
Set SUPADATA_API_KEY to enable it.
"""

import os
import time
import requests
from dotenv import load_dotenv

load_dotenv()

SUPADATA_URL = "https://api.supadata.ai/v1/transcript"


def captions_available() -> bool:
    return bool(os.getenv("SUPADATA_API_KEY"))


def fetch_youtube_transcript(url: str, language: str = "english") -> str:
    key = os.getenv("SUPADATA_API_KEY")
    if not key:
        raise RuntimeError("SUPADATA_API_KEY is not set in environment / .env")

    headers = {"x-api-key": key}
    # English is requested for both choices; Hinglish videos fall back to whatever captions exist.
    params = {"url": url, "lang": "en", "text": "true", "mode": os.getenv("SUPADATA_MODE", "auto")}

    print("Fetching the video's captions instead (Supadata) ...")
    response = requests.get(SUPADATA_URL, headers=headers, params=params, timeout=120)

    if response.status_code == 202:  # long video: poll the async job
        job_id = response.json().get("jobId")
        print("  → Captions are being prepared, waiting ...")
        for _ in range(90):
            time.sleep(4)
            response = requests.get(f"{SUPADATA_URL}/{job_id}", headers=headers, timeout=60)
            body = response.json() if response.ok else {}
            status = body.get("status")
            if status == "completed":
                break
            if status == "failed" or not response.ok:
                raise RuntimeError(f"Couldn't get the captions: {body.get('error') or response.text}")
        else:
            raise RuntimeError("Timed out waiting for the captions.")

    if not response.ok or response.status_code == 206:
        try:
            err = response.json()
        except ValueError:
            err = {}
        print(f"\n❌ Supadata returned {response.status_code}")
        print(f"Response body: {response.text[:500]}\n")
        code = err.get("error", "")
        if code == "transcript-unavailable" or response.status_code == 206:
            raise RuntimeError("This video has no captions we could use, and YouTube blocked the audio download.")
        if code == "limit-exceeded" or response.status_code in (402, 429):
            raise RuntimeError("The free caption allowance for this month is used up. Upload the file instead.")
        raise RuntimeError(err.get("message") or f"Couldn't get the captions ({response.status_code}).")

    body = response.json()
    content = body.get("content", "")
    if isinstance(content, list):
        content = " ".join(c.get("text", "") for c in content)
    text = " ".join(str(content).split())
    if not text:
        raise RuntimeError("This video has no captions we could use, and YouTube blocked the audio download.")
    print(f"Captions ready ({body.get('lang', '?')}, {len(text.split())} words).")
    return text
