import os
import subprocess
import time
import requests
from dotenv import load_dotenv

load_dotenv()

# Sarvam's sync STT-translate API rejects audio longer than 30s.
# We slice each chunk into 25s pieces (with a 5s safety margin) before sending.
SARVAM_PIECE_SECONDS = 25

# English transcription engine:
#   "groq"  → Whisper large-v3 hosted by Groq (default when GROQ_API_KEY is set; no PyTorch needed)
#   "local" → openai-whisper running on this machine (install requirements-local.txt)
TRANSCRIBE_ENGINE = os.getenv("TRANSCRIBE_ENGINE", "").lower() or ("groq" if os.getenv("GROQ_API_KEY") else "local")

WHISPER_MODEL = os.getenv("WHISPER_MODEL", "base")

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_STT_URL = "https://api.groq.com/openai/v1/audio/transcriptions"
GROQ_STT_MODEL = os.getenv("GROQ_STT_MODEL", "whisper-large-v3")

SARVAM_API_KEY = os.getenv("SARVAM_API_KEY")
SARVAM_STT_TRANSLATE_URL = "https://api.sarvam.ai/speech-to-text-translate"
SARVAM_MODEL = os.getenv("SARVAM_STT_MODEL", "saaras:v2.5")

_model = None


def load_model():

    global _model

    if _model is None:
        import whisper  # only needed for the local engine

        print(f"Loading Whisper model: {WHISPER_MODEL} ...")
        _model = whisper.load_model(WHISPER_MODEL)
        print("Whisper model loaded.")
    return _model


def transcribe_chunk_whisper(chunk_path: str) -> str:

    model = load_model()

    result = model.transcribe(chunk_path, task="transcribe")
    return result["text"]


def transcribe_chunk_groq(chunk_path: str) -> str:
    """
    Send one chunk (≤10 min) to Groq's hosted Whisper.
    The WAV is first compressed to 16 kHz mono MP3 (~2.4 MB per 10 min),
    well under Groq's 25 MB upload limit.
    """
    if not GROQ_API_KEY:
        raise RuntimeError("GROQ_API_KEY is not set in environment / .env")

    small_path = f"{chunk_path}_groq.mp3"
    subprocess.run(
        ["ffmpeg", "-y", "-i", chunk_path, "-ac", "1", "-ar", "16000", "-b:a", "32k", small_path],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    upload = small_path if os.path.exists(small_path) else chunk_path

    try:
        for attempt in range(4):
            with open(upload, "rb") as f:
                response = requests.post(
                    GROQ_STT_URL,
                    headers={"Authorization": f"Bearer {GROQ_API_KEY}"},
                    files={"file": (os.path.basename(upload), f, "audio/mpeg" if upload.endswith(".mp3") else "audio/wav")},
                    data={"model": GROQ_STT_MODEL, "response_format": "json", "temperature": "0"},
                    timeout=300,
                )
            if response.status_code == 429 and attempt < 3:
                wait = min(float(response.headers.get("retry-after", 20) or 20), 60)
                print(f"  → Groq rate limit, retrying in {wait:.0f}s ...")
                time.sleep(wait)
                continue
            break

        if not response.ok:
            print(f"\n❌ Groq returned {response.status_code}")
            print(f"Response body: {response.text}\n")
            if response.status_code == 429:
                raise RuntimeError("Groq's free transcription limit was reached. Wait a while and try again.")
            response.raise_for_status()

        return response.json().get("text", "")
    finally:
        if os.path.exists(small_path):
            os.remove(small_path)


def _send_to_sarvam(piece_path: str) -> str:
    """Send one ≤30s WAV file to Sarvam and return the English transcript."""
    headers = {"api-subscription-key": SARVAM_API_KEY}

    with open(piece_path, "rb") as f:
        files = {"file": (os.path.basename(piece_path), f, "audio/wav")}
        data = {"model": SARVAM_MODEL, "with_diarization": "false"}
        response = requests.post(
            SARVAM_STT_TRANSLATE_URL,
            headers=headers,
            files=files,
            data=data,
            timeout=120,
        )

    if not response.ok:
        print(f"\n❌ Sarvam returned {response.status_code}")
        print(f"Response body: {response.text}\n")
        response.raise_for_status()

    return response.json().get("transcript", "")


def _get_audio_duration(file_path: str) -> float:
    cmd = [
        "ffprobe", "-v", "error", "-show_entries",
        "format=duration", "-of",
        "default=noprint_wrappers=1:nokey=1", file_path
    ]
    result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    try:
        return float(result.stdout.strip())
    except ValueError:
        return 0.0


def transcribe_chunk_sarvam(chunk_path: str) -> str:
    """
    Sarvam sync API only accepts ≤30s audio. We split this chunk into
    25-second pieces, send each separately, and join the transcripts.
    """
    import math

    if not SARVAM_API_KEY:
        raise RuntimeError("SARVAM_API_KEY is not set in environment / .env")

    duration = _get_audio_duration(chunk_path)
    if duration == 0.0:
        return _send_to_sarvam(chunk_path)

    full_text = ""
    total_pieces = math.ceil(duration / SARVAM_PIECE_SECONDS)

    for i in range(total_pieces):
        start_time = i * SARVAM_PIECE_SECONDS
        piece_path = f"{chunk_path}_sv_{i}.wav"

        cmd = [
            "ffmpeg", "-y", "-i", chunk_path,
            "-ss", str(start_time),
            "-t", str(SARVAM_PIECE_SECONDS),
            "-c", "copy", piece_path
        ]
        subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

        try:
            print(f"  → Sarvam piece {i + 1}/{total_pieces} ...")
            full_text += _send_to_sarvam(piece_path) + " "
        finally:
            if os.path.exists(piece_path):
                os.remove(piece_path)

    return full_text.strip()


def transcribe_chunk(chunk_path: str, language: str = "english") -> str:
    """
    Route one chunk to Whisper or Sarvam depending on language choice.
    - english  → Whisper (Groq-hosted large-v3, or the local model)
    - hinglish → Sarvam (translates to English while transcribing)
    """
    if language.lower() == "hinglish":
        return transcribe_chunk_sarvam(chunk_path)
    if TRANSCRIBE_ENGINE == "groq":
        return transcribe_chunk_groq(chunk_path)
    return transcribe_chunk_whisper(chunk_path)


def transcribe_all(chunks: list, language: str = "english") -> str:

    full_transcript = ""

    if language.lower() == "hinglish":
        engine = "Sarvam AI"
    elif TRANSCRIBE_ENGINE == "groq":
        engine = f"Whisper ({GROQ_STT_MODEL} on Groq)"
    else:
        engine = f"Whisper ({WHISPER_MODEL}, local)"
    print(f"Using {engine} for transcription.")

    for i, chunk in enumerate(chunks):

        print(f"Transcribing chunk {i + 1}/{len(chunks)}...")

        text = transcribe_chunk(chunk, language=language)

        full_transcript += text + " "

    print("Transcription complete.")

    return full_transcript.strip()
