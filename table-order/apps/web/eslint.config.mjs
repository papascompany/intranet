import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: [".next/**", "node_modules/**", "next-env.d.ts"] },
  ...tseslint.configs.recommended,
  {
    // 테넌트 격리 가드(docs/02 §5): Prisma/DB 직접 접근은 repository 레이어에서만.
    files: ["**/*.ts", "**/*.tsx"],
    ignores: ["src/server/repos/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@menubook/db",
              message:
                "DB(Prisma) 접근은 src/server/repos/** 안에서만 허용됩니다 (docs/02 §5 테넌트 격리).",
            },
          ],
        },
      ],
    },
  },
);
