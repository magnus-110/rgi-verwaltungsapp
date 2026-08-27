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
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
