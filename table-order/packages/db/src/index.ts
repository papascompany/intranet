// M1에서 Prisma Client 인스턴스(prisma)와 repository용 타입을 export한다 (소유: db-schema 에이전트).
// 이 패키지의 import는 apps/web/src/server/repos/** 에서만 허용된다 — docs/02 §5, ESLint 가드 참조.
export const DB_PACKAGE_STATUS = "scaffold-only (M1에서 구현)" as const;
