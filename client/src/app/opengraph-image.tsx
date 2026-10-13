import { ImageResponse } from "next/og";

export const alt = "Afterword · Every video, remembered.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Fetch a Google font subset (only the glyphs we draw) as TTF for Satori. */
async function font(family: string, text: string) {
  try {
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${family}&text=${encodeURIComponent(text)}`)).text();
    const url = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/)?.[1];
    return url ? await (await fetch(url)).arrayBuffer() : null;
  } catch {
    return null;
  }
}

export default async function OpengraphImage() {
  const [serif, sans, body] = await Promise.all([
    font("Newsreader:ital,wght@1,300", "Afterremembered."),
    font("Archivo:wght@500", "wordEvery video,"),
    font("Hanken+Grotesk:wght@400", "Transcript · Summary · Action items · Decisions · Chat"),
  ]);
  const fonts = [
    serif && { name: "Serif", data: serif, style: "italic" as const, weight: 300 as const },
    sans && { name: "Sans", data: sans, style: "normal" as const, weight: 500 as const },
    body && { name: "Body", data: body, style: "normal" as const, weight: 400 as const },
  ].filter(Boolean) as { name: string; data: ArrayBuffer; style: "italic" | "normal"; weight: 300 | 400 | 500 }[];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          backgroundColor: "#F5F5F2",
          backgroundImage:
            "radial-gradient(circle at 82% 22%, rgba(255,196,150,0.75) 0%, rgba(255,196,150,0) 34%), radial-gradient(circle at 66% 62%, rgba(255,176,196,0.6) 0%, rgba(255,176,196,0) 30%), radial-gradient(circle at 95% 72%, rgba(178,166,255,0.6) 0%, rgba(178,166,255,0) 32%)",
          color: "#111114",
          fontFamily: "Sans",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", fontSize: 38 }}>
          <div style={{ width: 40, height: 40, borderRadius: 40, border: "9px solid #DE6A85", marginRight: 18 }} />
          <span style={{ fontFamily: "Serif", fontStyle: "italic" }}>After</span>
          <span>word</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", fontSize: 120, lineHeight: 0.95, letterSpacing: -5 }}>
          <span>Every video,</span>
          <span style={{ fontFamily: "Serif", fontStyle: "italic", letterSpacing: -2 }}>remembered.</span>
        </div>
        <div style={{ fontSize: 26, color: "rgba(17,17,20,0.6)", fontFamily: "Body" }}>Transcript · Summary · Action items · Decisions · Chat</div>
      </div>
    ),
    { ...size, fonts },
  );
}
