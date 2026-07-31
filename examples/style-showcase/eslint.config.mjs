import js from "@eslint/js";

export default [
  {
    ignores: ["generated/"],
  },
  js.configs.recommended,
];
