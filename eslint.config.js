import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["node_modules", "work"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // Findings text must never reach logs; use src/log.ts instead.
      "no-console": "error",
    },
  },
  {
    files: ["src/log.ts", "scripts/**"],
    rules: { "no-console": "off" },
  },
);
