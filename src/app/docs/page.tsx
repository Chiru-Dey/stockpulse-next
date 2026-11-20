"use client";

import Link from "next/link";
import Script from "next/script";
import { useRef, useState } from "react";

type ScalarGlobal = {
  createApiReference?: (
    target: string | HTMLElement,
    config: Record<string, unknown>,
  ) => unknown;
};

declare global {
  interface Window {
    Scalar?: ScalarGlobal;
  }
}

const SCALAR_CONFIG: Record<string, unknown> = {
  url: "/api/openapi",
  darkMode: true,
};

export default function DocsPage() {
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  const mountRef = useRef<HTMLDivElement | null>(null);
  const mountedRef = useRef(false);

  function mountReference() {
    if (mountedRef.current) return;
    const mount = mountRef.current;
    if (!mount) {
      setStatus("failed");
      return;
    }

    // Scalar parses any pre-existing text inside the target as an inline
    // spec, so this node must stay empty — React never renders children here.
    const create = window.Scalar?.createApiReference;
    if (typeof create === "function") {
      try {
        create(mount, SCALAR_CONFIG);
        mountedRef.current = true;
        setStatus("ready");
      } catch {
        setStatus("failed");
      }
      return;
    }

    // Bundles that expose only the web component take a JSON config attribute.
    if (
      typeof customElements !== "undefined" &&
      customElements.get("scalar-api-reference")
    ) {
      const element = document.createElement("scalar-api-reference");
      element.setAttribute("configuration", JSON.stringify(SCALAR_CONFIG));
      mount.appendChild(element);
      mountedRef.current = true;
      setStatus("ready");
      return;
    }

    setStatus("failed");
  }

  return (
    <main className="min-h-screen bg-slate-950">
      <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-2 text-sm">
        <span className="font-semibold text-white">StockPulse · API reference</span>
        <div className="flex items-center gap-4">
          <a href="/api/openapi" className="text-slate-400 hover:text-white">
            Raw OpenAPI JSON
          </a>
          <Link href="/login" className="text-slate-400 hover:text-white">
            Back to app
          </Link>
        </div>
      </div>

      {status === "loading" && (
        <p className="px-4 py-10 text-sm text-slate-400">Loading API reference…</p>
      )}
      {status === "failed" && (
        <div className="mx-auto max-w-xl px-4 py-10 text-sm text-slate-300">
          <p className="mb-2 font-semibold text-white">Interactive reference unavailable</p>
          <p>
            The Scalar viewer could not be loaded from its CDN (offline or blocked). The
            machine-readable spec is always available at{" "}
            <a className="underline" href="/api/openapi">/api/openapi</a>.
          </p>
        </div>
      )}

      {/* Scalar owns everything inside this node. React renders no children
          here, so third-party DOM mutations can never collide with
          reconciliation (no hydration mismatches, no orphaned removeChild). */}
      <div ref={mountRef} id="scalar-root" />

      <Script
        src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"
        strategy="afterInteractive"
        onLoad={mountReference}
        onError={() => setStatus("failed")}
      />
    </main>
  );
}