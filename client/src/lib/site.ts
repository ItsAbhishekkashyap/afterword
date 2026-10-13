const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;

export const SITE = {
  name: "Afterword",
  tagline: "Every video, remembered.",
  description:
    "Afterword turns any video or recording you upload into a transcript, a summary, action items, decisions and open questions, plus a chat that answers only from what was said. Works with English and Hinglish.",
  url: (process.env.NEXT_PUBLIC_SITE_URL || (vercel ? `https://${vercel}` : "http://localhost:3000")).replace(/\/$/, ""),
  github: "https://github.com/ItsAbhishekkashyap/AI-Agent-Video-Analyzer",
};

export const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");
