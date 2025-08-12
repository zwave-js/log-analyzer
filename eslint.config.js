import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
	{
		ignores: ["dist", "node_modules"],
	},
	{
		files: ["**/*.{ts,tsx}"],
		extends: [
			js.configs.recommended,
			...tseslint.configs.recommended,
			reactHooks.configs["recommended-latest"],
		],
		languageOptions: {
			ecmaVersion: 2020,
			globals: globals.browser,
		},
		plugins: {
			"react-refresh": reactRefresh,
		},
		rules: {
			"react-refresh/only-export-components": [
				"warn",
				{ allowConstantExport: true },
			],
			"@typescript-eslint/no-explicit-any": "off",
		},
	},
	{
		files: ["src/cli.ts", "src/index.ts", "src/lib/**/*.ts"],
		languageOptions: {
			globals: globals.node,
		},
	},
);
