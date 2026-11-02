import path from "path";
import { defineConfig } from "vitest/config";

/**
 * Tests laufen in Node, ohne Browser-Umgebung — der Rechenkern der
 * Heizkostenabrechnung ist reine Logik und braucht kein DOM.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // wie in vite.config.ts: gemeinsamer Code mit den Edge Functions
      "@shared": path.resolve(__dirname, "./supabase/functions/_shared"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
