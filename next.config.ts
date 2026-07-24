import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // "@mastra/*": bundled Mastra packages break under Turbopack's SSR
  // chunking (dynamic imports get rewritten to paths that don't exist in
  // the output). "pdf-parse"/"pdfjs-dist": pdf-parse wraps pdfjs-dist,
  // which dynamically imports its own worker script
  // (pdf.worker.mjs) relative to its own module location at runtime.
  // "@napi-rs/canvas" provides native Node canvas globals used by pdf.js.
  serverExternalPackages: ["@mastra/*", "pdf-parse", "pdfjs-dist", "@napi-rs/canvas"],
};

export default nextConfig;
