// Dev-only ESLint flat config. Enforces the modularization gate used by active
// tower mods and catches correctness issues. Not shipped in release artifacts.

const ENGINE_GLOBALS = {
  Game: "readonly",
  GameContext: "readonly",
  Online: "readonly",
  Players: "readonly",
  GameInfo: "readonly",
  GameplayMap: "readonly",
  Configuration: "readonly",
  Locale: "readonly",
  engine: "readonly",
  Database: "readonly",
  Controls: "readonly",
  Cities: "readonly",
  Districts: "readonly",
  ComponentID: "readonly",
  Modding: "readonly",
  UI: "readonly",
  WorldUI: "readonly",
  Loading: "readonly",
  InputActionStatuses: "readonly",
  SpriteMode: "readonly",
  RiverTypes: "readonly"
};

const BROWSER_GLOBALS = {
  window: "readonly",
  document: "readonly",
  console: "readonly",
  localStorage: "readonly",
  globalThis: "readonly",
  structuredClone: "readonly",
  setTimeout: "readonly",
  clearTimeout: "readonly",
  setInterval: "readonly",
  clearInterval: "readonly",
  requestAnimationFrame: "readonly",
  cancelAnimationFrame: "readonly",
  MutationObserver: "readonly",
  CustomEvent: "readonly"
};

export default [
  {
    files: ["ui/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...ENGINE_GLOBALS, ...BROWSER_GLOBALS }
    },
    rules: {
      complexity: ["error", 10],
      "max-lines-per-function": [
        "error",
        { max: 50, skipBlankLines: true, skipComments: true, IIFEs: true }
      ],
      "max-lines": ["error", { max: 500, skipBlankLines: true, skipComments: true }],
      "max-len": [
        "error",
        {
          code: 120,
          ignoreUrls: true,
          ignoreStrings: true,
          ignoreTemplateLiterals: true,
          ignoreRegExpLiterals: true
        }
      ],
      "max-params": ["error", 5],
      "max-depth": ["error", 4],
      "max-statements": ["error", 18],
      "no-undef": "error",
      "no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }
      ],
      eqeqeq: ["error", "always", { null: "ignore" }]
    }
  }
];
