import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // "@mastra/*": bundled Mastra packages break under Turbopack's SSR
  // chunking (dynamic imports get rewritten to paths that don't exist in
  // the output). "pdf-parse"/"pdfjs-dist": pdf-parse wraps pdfjs-dist,
  // which dynamically imports its own worker script
  // (pdf.worker.mjs) relative to its own module location at runtime —
  // Turbopack's dev SSR bundle doesn't preserve that file at the
  // computed path, causing "Setting up fake worker failed: Cannot find
  // module '.../pdf.worker.mjs'". Excluding both from bundling makes
  // Next.js resolve them via plain Node `require`/`import` against the
  // real node_modules layout instead, where the relative path is valid.
  serverExternalPackages: ["@mastra/*", "pdf-parse", "pdfjs-dist"],
};

export default nextConfig;
