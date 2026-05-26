import { config as reactInternalConfig } from "./react-internal.js";
import globals from "globals";

/**
 * A shared ESLint configuration for React Native / Expo apps.
 * Extends react-internal but adjusts for the non-browser environment
 * and React Native conventions (require() for image assets, etc.).
 *
 * @type {import("eslint").Linter.Config[]}
 */
export const config = [
  ...reactInternalConfig,

  // Global overrides for all RN files.
  {
    languageOptions: {
      globals: {
        ...globals.node,
        // React Native exposes these as globals at runtime.
        __DEV__: "readonly",
        fetch: "readonly",
        FormData: "readonly",
        XMLHttpRequest: "readonly",
        AbortController: "readonly",
      },
    },
    rules: {
      // display-name is noisy in RN due to anonymous forwardRef usage.
      "react/display-name": "off",
      // React Native uses require() for dynamic image assets — this is
      // the documented bundler pattern and cannot use ESM import syntax.
      "@typescript-eslint/no-require-imports": "off",
    },
  },

  // Jest test files: add jest globals, allow require() in jest.fn() mocks.
  {
    files: [
      "**/*.test.ts",
      "**/*.test.tsx",
      "jest.setup.js",
      "test/**/*.ts",
      "test/**/*.tsx",
    ],
    languageOptions: {
      globals: globals.jest,
    },
  },

  // CommonJS config files (metro.config.js, babel.config.js, scripts/).
  {
    files: ["*.config.js", "scripts/**/*.js"],
    languageOptions: {
      globals: globals.node,
    },
  },

  // Ignore generated / build artefacts.
  { ignores: ["coverage/**", "dist/**", ".expo/**", "node_modules/**"] },
];
