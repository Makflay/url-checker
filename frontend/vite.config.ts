import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react()],

  define:
    mode === "test"
      ? {
          "import.meta.env.VITE_API_BASE_URL":
            JSON.stringify("http://api.test"),
        }
      : undefined,

  test: {
    environment: "jsdom",
    globals: false,
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    setupFiles: ["./src/test/setup.ts"],
    clearMocks: true,
    restoreMocks: true,
    unstubGlobals: true,
  },
}));
