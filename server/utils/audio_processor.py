import yt_dlp
import os
import subprocess
import math

DOWNLOAD_DIR = 'downloades'
os.makedirs(DOWNLOAD_DIR, exist_ok=True)

def get_audio_duration(file_path: str) -> float:
    """Get the duration of an audio file in seconds using ffprobe."""
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

def _cookie_file():
    """
    YouTube often asks cloud servers to "sign in to confirm you're not a bot".
    yt-dlp gets past that with the cookies of a signed-in YouTube account (Netscape cookies.txt), from:
      YTDLP_COOKIES       the file's contents (e.g. a Render environment variable), or
      YTDLP_COOKIES_FILE  a path to it (e.g. a Render secret file: /etc/secrets/cookies.txt).
    yt-dlp writes refreshed cookies back, so it gets a writable copy.
    """
    text = os.getenv("YTDLP_COOKIES")
    path = os.getenv("YTDLP_COOKIES_FILE")
    if not text and path and os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            text = f.read()
    if not text:
        return None
    copy = os.path.join(DOWNLOAD_DIR, ".yt_cookies.txt")
    with open(copy, "w", encoding="utf-8") as f:
        f.write(text.replace("\\n", "\n") if "\n" not in text else text)
    return copy


def download_youtube_audio(url: str) -> str:
    output_path = os.path.join(DOWNLOAD_DIR, "%(title)s.%(ext)s")
    ydl_opts = {
        "format": "bestaudio/best",
        "outtmpl": output_path,
        "postprocessors": [
            {
                "key": "FFmpegExtractAudio",
                "preferredcodec": "wav",
                "preferredquality": "192",
            }
        ],
        "quiet": True,
    }
    cookies = _cookie_file()
    if cookies:
        ydl_opts["cookiefile"] = cookies
    # Force IPv4 (YouTube distrusts many cloud IPv6 ranges) and, if YouTube asks us to prove
    # we're not a bot, retry as other YouTube apps (TV, Safari, mobile web), which are often let through.
    ydl_opts["source_address"] = "0.0.0.0"
    attempts = [None, ["tv", "web_safari"], ["mweb"], ["android_vr"], ["ios"]]
    last_error = None
    for clients in attempts:
        opts = dict(ydl_opts)
        if clients:
            opts["extractor_args"] = {"youtube": {"player_client": clients}}
            print(f"  → Retrying as YouTube client: {', '.join(clients)} ...")
        try:
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(url, download=True)
                filename = ydl.prepare_filename(info).replace(".webm", ".wav").replace(".m4a", ".wav")
            return filename
        except yt_dlp.utils.DownloadError as e:
            last_error = e
            if not is_bot_check(str(e)):
                raise
    raise last_error


def is_bot_check(message: str) -> bool:
    m = message.lower()
    return "not a bot" in m or "sign in to confirm" in m or "cookies-from-browser" in m or "http error 403" in m

def convert_to_wav(input_path: str) -> str:
    """Convert any audio/video file to WAV format using ffmpeg directly (bypassing pydub)."""
    output_path = os.path.splitext(input_path)[0] + "_converted.wav"
    cmd = [
        "ffmpeg", "-y", "-i", input_path,
        "-ac", "1", "-ar", "16000", output_path
    ]
    subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return output_path

def chunk_audio(wav_path: str, chunk_minutes: int = 10) -> list:
    """Split audio into chunks using ffmpeg."""
    duration = get_audio_duration(wav_path)
    chunk_seconds = chunk_minutes * 60
    chunks = []
    
    if duration == 0.0:
        # Fallback if ffprobe fails, just return the whole file
        return [wav_path]

    num_chunks = math.ceil(duration / chunk_seconds)
    
    for i in range(num_chunks):
        start_time = i * chunk_seconds
        chunk_path = f"{wav_path}_chunk_{i}.wav"
        
        cmd = [
            "ffmpeg", "-y", "-i", wav_path,
            "-ss", str(start_time),
            "-t", str(chunk_seconds),
            "-c", "copy", chunk_path
        ]
        subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        chunks.append(chunk_path)
    
    return chunks

def process_input(source: str) -> list:
    if source.startswith("http://") or source.startswith("https://"):
        print("Detected YouTube URL. Downloading audio...")
        wav_path = download_youtube_audio(source)
    else:
        print("Detected local file. Converting to WAV...")
        wav_path = convert_to_wav(source)

    print("Chunking audio...")
    chunks = chunk_audio(wav_path)
    print(f"Audio ready — {len(chunks)} chunk(s) created.")
    return chunks
