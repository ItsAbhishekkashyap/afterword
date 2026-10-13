import type { Metadata } from "next";
import { Suspense } from "react";
import { Studio } from "@/components/Studio";

export const metadata: Metadata = {
  title: "Studio",
  description: "Paste a YouTube link or upload a recording to get a transcript, summary, action items and a chat.",
  robots: { index: false },
};

export default function StudioPage() {
  return (
    <Suspense fallback={<main id="studio" />}>
      <Studio />
    </Suspense>
  );
}
