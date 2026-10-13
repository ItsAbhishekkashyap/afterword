import { API_URL } from "./site";

export type Language = "english" | "hinglish";

export type PipelineResult = {
  title: string;
  transcript: string;
  summary: string;
  action_items: string;
  key_decisions: string;
  open_questions: string;
};

export type StageInfo = { name: string; seconds: number | null; state: "waiting" | "running" | "done" };

export type Job = {
  id: string;
  status: "running" | "done" | "error" | "cancelled";
  source: string;
  language: Language;
  stage: number;
  stages: StageInfo[];
  logs: string[];
  elapsed: number;
  error: string | null;
  result: PipelineResult | null;
};

export class ApiError extends Error {
  constructor(message: string, public status = 0) {
    super(message);
  }
}

const OFFLINE =
  process.env.NODE_ENV === "development"
    ? "Can't reach the Afterword server. Start it from server/ with: python -X utf8 -m uvicorn api.main:app --port 8000"
    : "Can't reach the Afterword server right now.";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, init);
  } catch {
    throw new ApiError(OFFLINE, 0);
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* empty body */
  }
  if (!res.ok) {
    const detail = (body as { detail?: unknown } | null)?.detail;
    throw new ApiError(typeof detail === "string" ? detail : `The server answered with an error (${res.status}).`, res.status);
  }
  return body as T;
}

/** Upload a file and start an analysis. Uses XHR so the UI can show upload progress (0–1). */
export function startAnalysis(input: { file?: File; url?: string; language: Language }, onProgress?: (p: number) => void) {
  const form = new FormData();
  form.set("language", input.language);
  if (input.file) form.set("file", input.file);
  else if (input.url) form.set("url", input.url);
  return new Promise<{ id: string }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_URL}/api/analyze`);
    xhr.responseType = "json";
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => {
      const body = xhr.response as { id?: string; detail?: unknown } | null;
      if (xhr.status >= 200 && xhr.status < 300 && body?.id) return resolve({ id: body.id });
      const detail = body?.detail;
      reject(
        new ApiError(
          typeof detail === "string" ? detail : xhr.status === 413 ? "That file is too large for the server." : `The server answered with an error (${xhr.status}).`,
          xhr.status,
        ),
      );
    };
    xhr.onerror = () => reject(new ApiError(OFFLINE, 0));
    xhr.send(form);
  });
}

export const getJob = (id: string) => request<Job>(`/api/jobs/${encodeURIComponent(id)}`, { cache: "no-store" });

export const cancelJob = (id: string) =>
  request<{ ok: boolean }>(`/api/jobs/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => ({ ok: false }));

export const askVideo = (id: string, question: string) =>
  request<{ answer: string }>(`/api/jobs/${encodeURIComponent(id)}/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  });
