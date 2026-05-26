import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";
import pluginReactHooks from "eslint-plugin-react-hooks";
import pluginReact from "eslint-plugin-react";
import globals from "globals";
import { config as baseConfig } from "./base.js";

/**
 * A shared ESLint configuration for React apps and libraries (browser).
 *
 * @type {import("eslint").Linter.Config[]}
 */
export const config = [
  ...baseConfig,
  js.configs.recommended,
  eslintConfigPrettier,
  ...tseslint.configs.recommended,
  pluginReact.configs.flat.recommended,
  {
    languageOptions: {
      ...pluginReact.configs.flat.recommended.languageOptions,
      globals: {
        ...globals.serviceworker,
        ...globals.browser,
      },
    },
  },
  // react-hooks v5: recommended-latest is the flat-config-ready object
  pluginReactHooks.configs['recommended-latest'],
  {
    settings: { react: { version: "detect" } },
    rules: {
      // React scope no longer required with the new JSX transform.
      "react/react-in-jsx-scope": "off",
      // Covered by TypeScript — no runtime value for prop-types.
      "react/prop-types": "off",
    },
  },
];
