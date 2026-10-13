import Link from "next/link";

export default function NotFound() {
  return (
    <main id="studio">
      <div className="aura" aria-hidden="true" />
      <div className="view">
        <div className="errv">
          <div className="crumb mono">
            <span>404</span>
            <span>/</span>
            <b>Not found</b>
          </div>
          <h1 className="display">
            This page <em>isn&apos;t on the reel.</em>
          </h1>
          <p>The link may be old or mistyped.</p>
          <div className="res-actions">
            <Link className="go" href="/">Back to home</Link>
            <Link className="ghost" href="/studio">Open studio</Link>
          </div>
        </div>
      </div>
    </main>
  );
}
