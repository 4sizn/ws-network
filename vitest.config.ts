import { defineConfig } from 'vitest/config';

// 유닛 티어는 인프로세스 서버 없이 밀리초 단위로 끝나야 한다. 통합 티어는
// 실제 소켓을 열기 때문에 타임아웃이 더 길다. 그래서 프로젝트를 나눈다.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts'],
          exclude: ['src/**/*.integration.test.ts'],
        },
      },
      {
        test: {
          name: 'integration',
          include: ['src/**/*.integration.test.ts'],
          testTimeout: 15000,
        },
      },
    ],
  },
});
