import { config as sharedConfig } from "@repo/eslint-config/react-internal";
import reactRefresh from "eslint-plugin-react-refresh";

/**
 * Extend the shared React config with Vite-specific rules.
 * react-refresh warns when a module exports non-component values alongside
 * components, which breaks HMR — only meaningful in a Vite dev server.
 *
 * @type {import("eslint").Linter.Config[]}
 */
export default [
  ...sharedConfig,
  {
    plugins: { "react-refresh": reactRefresh },
    rules: {
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
    },
  },
];
