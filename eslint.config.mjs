import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Links prefetch on intent only (AppLink.tsx, .ui-tests/perf/plan.md P1-1):
  // a bare next/link would prefetch again on sight.
  {
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "next/link",
              message: 'Importez Link depuis "@/components/ui/AppLink" (préchargement à l\'intention seulement).',
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/components/ui/AppLink.tsx"],
    rules: { "no-restricted-imports": "off" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
