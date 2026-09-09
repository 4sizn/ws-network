import { defineConfig } from 'vitest/config';

/**
 * 통합 테스트 티어. 실제 MQTT 브로커를 상대로 실제 `mqtt` 모듈을 주입해
 * 검증한다. 단위 티어와 완전히 분리된 독립 환경이다.
 *
 * 기본값은 인프로세스 `aedes` 브로커라 오프라인·CI에서 그대로 돌아간다.
 * `MQTT_TEST_BROKER_URL`을 주면 그 브로커를 겨냥한다 (외부 브로커는 명시적
 * opt-in만 허용 — 기본 실행이 네트워크에 의존하지 않게 한다).
 *
 * 실행: `npm run test:integration`
 */
export default defineConfig({
  test: {
    include: ['src/**/*.integration.test.ts'],
    exclude: ['**/node_modules/**'],
    // 브로커 기동과 실제 왕복이 있으므로 단위 티어보다 넉넉하게 둔다.
    testTimeout: 20000,
    hookTimeout: 20000,
    // 브로커 포트를 공유하므로 파일 간 병렬 실행을 막는다.
    fileParallelism: false,
  },
});
