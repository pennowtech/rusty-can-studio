import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { visualizer } from "rollup-plugin-visualizer";
import path from "path";
import fs from "fs";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// Sibling checkout during active local development; falls back to a real
// npm dependency (once sbt-desktop-kit is pinned to a git ref) for a
// machine that only has this one repo cloned. See docs/shared-code-migration-plan.md.
const siblingKitSrc = path.resolve(__dirname, "../sbt-desktop-kit/src");
const nodeModulesKitSrc = path.resolve(__dirname, "./node_modules/sbt-desktop-kit/src");
const sbtDesktopKitPath = fs.existsSync(siblingKitSrc) ? siblingKitSrc : nodeModulesKitSrc;

if (!fs.existsSync(siblingKitSrc) && !fs.existsSync(nodeModulesKitSrc)) {
  console.warn(
    '[sbt-desktop-kit] Neither "../sbt-desktop-kit" nor "node_modules/sbt-desktop-kit" was found.\n' +
      "  Clone it as a sibling of this repo, or add it to package.json as a git dependency using the\n" +
      '  SAME unscoped key the fallback path looks for, e.g. "sbt-desktop-kit":\n' +
      '  "github:pennowtech/sbt-desktop-kit#v0.3.0", then run npm install.\n' +
      "  Any import from \"@sbt/desktop-kit\" will fail to resolve until then.",
  );
}

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "RustyCAN",
        short_name: "RustyCAN",
        description: "Remote CAN-FD monitoring, trace inspection, and profile-driven decoding.",
        display: "standalone",
        orientation: "any",
        start_url: "/",
        scope: "/",
        theme_color: "#0f172a",
        background_color: "#ffffff",
        categories: ["utilities", "productivity", "developer"],
        icons: [
          {
            src: "favicon.png",
            sizes: "1024x1024",
            type: "image/png",
            purpose: "any",
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@sbt/desktop-kit": sbtDesktopKitPath,
    },
    test: {
      environment: "jsdom",
      globals: true,
    },
  },
  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
