import { defineConfig } from 'vitest/config';

/**
 * 단위 테스트 티어. 페이크만 쓰고 네트워크를 타지 않으므로 항상 오프라인에서
 * 돌아간다. 실제 브로커를 띄우는 `*.integration.test.ts`는 여기서 제외하고
 * `vitest.integration.config.ts`가 따로 담당한다.
 *
 * 이 파일은 vitest만 읽는다. `vite build`는 `vite.config.*`를 찾으므로
 * 빌드 동작에는 영향이 없다.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['**/node_modules/**', 'src/**/*.integration.test.ts'],
  },
});
