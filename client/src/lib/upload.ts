/* Upload rules shared by the landing page and the studio. */

export const MAX_UPLOAD_MB = Number(process.env.NEXT_PUBLIC_MAX_UPLOAD_MB || 500);
/** YouTube links are only offered when the server allows them (e.g. running on your own PC). */
export const ALLOW_LINKS = process.env.NEXT_PUBLIC_ALLOW_LINKS === "true";
export const isUrl = (v: string) => /^https?:\/\/\S+\.\S+/.test(v.trim());
export const ACCEPT = "video/*,audio/*,.mp4,.mov,.mkv,.webm,.avi,.mp3,.wav,.m4a,.aac,.ogg,.flac";
export const FORMATS = "MP4, MOV, MKV, MP3, WAV, M4A";

const MEDIA_EXT = /\.(mp4|mov|m4v|mkv|webm|avi|wmv|flv|mpeg|mpg|3gp|mp3|wav|m4a|aac|ogg|oga|opus|flac|wma|amr)$/i;

export const fmtSize = (b: number) => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.max(0.1, b / 1e6).toFixed(1)} MB`);

/** Returns an error message, or null when the file can be analyzed. */
export function checkFile(f: File): string | null {
  const isMedia = f.type.startsWith("video/") || f.type.startsWith("audio/") || MEDIA_EXT.test(f.name);
  if (!isMedia) return "That isn't a video or audio file. Choose an MP4, MOV, MP3, WAV or similar.";
  if (f.size > MAX_UPLOAD_MB * 1024 * 1024) return `That file is ${fmtSize(f.size)}. The limit is ${MAX_UPLOAD_MB} MB; trim or compress it and try again.`;
  if (f.size === 0) return "That file is empty.";
  return null;
}

/* The landing page hands the chosen file to the studio across client-side navigation. */
let pending: { file: File; language: "english" | "hinglish" } | null = null;
export const setPendingUpload = (p: typeof pending) => void (pending = p);
export const takePendingUpload = () => {
  const p = pending;
  pending = null;
  return p;
};
