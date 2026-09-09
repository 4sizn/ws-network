# Plan: MQTT 프로토콜 어댑터 (모듈 외부 주입)

- **Spec:** `docs/sdlc/mqtt-protocol/spec.md`
- **Date:** 2026-09-09
- **Status:** done

**Goal:** `mqtt` 모듈을 호출자가 주입하는 MQTT 어댑터·파사드를
`src/lib/protocols/mqtt/`에 추가한다. 저장소 런타임 의존성은 늘지 않는다.

**Architecture:** `src/lib/protocols/stomp/`의 2계층 구조(어댑터 +
파사드 + `index.ts`)를 미러링한다. 어댑터는 `WebSocketClientAdapter<
IMqttClient>`를 상속하고 `connect()` 안에서 주입받은 `connect` 팩토리로
클라이언트를 만든다. MQTT의 단일 `message` 이벤트는 `topicMatch()`로
필터 매칭해 구독별 콜백에 분배한다.

## Steps

0. **의존성 설치 + 기준선 기록** — `npm install`
   - 이유: `node_modules`가 없어 지금은 `npm test`/`lint`/`build`를 아예 실행할
     수 없다 (`vitest: command not found`).
   - Change: 설치 후 세 명령을 각각 실행해 **현재 실패를 그대로 기록**한다.
     `main.ts`가 큰따옴표를 쓰므로 Biome lint가 이미 빨간불일 수 있다.
   - Verify: 기준선 3줄을 이 파일 Deviations 절에 적는다. 이후 단계에서는
     "기준선 대비 새로 생긴 실패 0건"을 종료 조건으로 쓴다.

1. **작업 브랜치 생성** — `git switch -c feat/mqtt-protocol`
   - 이유: `main` 직접 커밋 금지 (skill Stage 5).
   - 주의: 기존 미커밋 변경(`AGENTS.md`, `.gitignore`,
     `.agents/skills/`)은 **건드리지 않고** 스테이징에서 제외한다.
   - Verify: `git status`에 새 브랜치, 기존 변경 그대로 남음

2. **테스트용 mqtt 설치** — `package.json`
   - Change: `npm install --save-dev mqtt@5.14.0`
   - 주의: `bun.lockb`도 저장소에 있지만 `bun`이 이 머신에 없다. `npm`으로만
     설치하므로 `bun.lockb`는 낡은 상태로 남는다. 손대지 않고 PR에 명시한다.
   - Verify: `dependencies`에 없고 `devDependencies`에 `5.14.0` 고정 (AC1)

3. **`isTopicMatch` 테스트 작성 (실패 확인)** —
   `src/lib/protocols/mqtt/topicMatch.test.ts`
   - Change: `+` 한 레벨 / `#` 잔여 전체 / `$SYS` 제외 / 완전일치 케이스
   - Verify: `npm test` — 모듈 없음으로 실패 (기대한 이유)

4. **`isTopicMatch` 구현** — `src/lib/protocols/mqtt/topicMatch.ts`
   - Change: `export function isTopicMatch(filter: string, topic: string): boolean`
   - Verify: `npm test` 통과 (AC4의 매칭 규칙 부분)

5. **어댑터 테스트 작성 (실패 확인)** —
   `src/lib/protocols/mqtt/MqttWebSocketClientAdapter.test.ts`
   - Change: `IMqttClient` 구현 `FakeMqttClient`(`emit()` 헬퍼 보유) +
     주입 `connect` 스텁. subscribe/와일드카드 분배/바이너리 디코딩/publish/
     `end()` 호출/`networkStatus()`/`WebSocketClient` 이벤트 전파 케이스.
   - Verify: `npm test` — 어댑터 없음으로 실패

6. **어댑터 구현** — `src/lib/protocols/mqtt/MqttWebSocketClientAdapter.ts`
   - Change: spec의 `IMqttClient` / `MqttConnect` /
     `MqttWebSocketClientAdapterOptions` / `PubSubAble` 로컬 선언 +
     `MqttWebSocketClientAdapter`. `connect()`에서 팩토리 호출 후
     `on('connect'|'message'|'error'|'close')` 배선, `message`는
     `TextDecoder`로 디코딩해 매칭 구독에 분배.
   - Verify: `npm test` 통과 (AC4–AC7)

7. **파사드 + 배럴** — `src/lib/protocols/mqtt/MqttWebSocketClient.ts`,
   `src/lib/protocols/mqtt/index.ts`
   - Change: `private get adapter()` 위임과 배럴 재수출은 `stomp/index.ts`와
     동일. 단 **`connect()`/`disconnect()`는 오버라이드하지 않고**
     `plugins`/`logger`를 `super`로 넘긴다 (`WindowWebSocketClient` 선례).
     STOMP 파사드를 그대로 베끼면 플러그인 훅이 죽는다 — spec 파사드 절 참고.
   - Verify: 플러그인 `onBeforeConnect`/`onAfterConnect`가 실제 호출되는 테스트
     (AC6) + `npm run build` 통과

8. **실제 `mqtt@5.14.0` 타입 호환 테스트** —
   `src/lib/protocols/mqtt/MqttWebSocketClientAdapter.test.ts`에 추가
   - Change: `import { connect } from 'mqtt'` 후
     `const fn: MqttConnect<Parameters<typeof connect>[1]> = connect;` 대입
     + 런타임 미연결(타입만 검증). default export 유무에 의존하지 않는다.
   - 막히면: `moduleResolution: "Node"`(레거시) + TS `^4.6.4` 조합이 원인일 수
     있다. tsconfig는 저장소 전체에 영향을 주므로 **임의로 바꾸지 않고 보고**한다.
   - Verify: `npm run build` 통과 = AC3 충족. **실패하면 여기서 멈추고
     `IMqttClient` 시그니처 완화 후 보고**

9. **격리 검증 + 문서** — `AGENTS.md`, `README.md`
   - Change: `grep -rn "from 'mqtt'" src/lib/protocols/mqtt` 로 AC2 확인.
     AGENTS.md WS-NETWORK CODE RULES에 "MQTT는 `mqtt` 모듈을 주입받는다
     (`dependencies` 금지, devDependency는 테스트용)" 한 줄 추가.
     README에 MQTT 절 추가 — 현재 README가 "STOMP support is opt-in and isolated"
     를 명시하고 프로토콜별 사용법을 문서화하는 구조이므로 MQTT도 같은 대우를
     받아야 한다. 주입 예시(`import { connect } from 'mqtt'`)를 포함한다.
   - Verify: grep 결과가 테스트 파일 1건뿐

9.5 **적대적 리뷰 반영** — `src/lib/protocols/mqtt/*.ts`
   - Change: `review.md`의 채택 항목 B1·B2·D1·D2·D3·D4·S1·S2를 구현한다.
     각 항목마다 실패하는 테스트를 먼저 쓴다 (AC10–AC17).
   - Verify: `npm test` — 신규 8개 AC 전부 통과

10. **최종 검증 + 커밋** — 커밋 메시지:
    `feat: add injected-module MQTT protocol client`
    - Verify: 아래 Verification 3개 명령 전부 통과 후 커밋

## Files touched

| File | New / modified | Why |
|------|----------------|-----|
| `docs/sdlc/mqtt-protocol/{intent,spec,plan}.md` | new | SDLC 산출물 |
| `package.json`, lockfile | modified | `mqtt@5.14.0` devDependency |
| `src/lib/protocols/mqtt/topicMatch.ts` | new | MQTT 와일드카드 매칭 |
| `src/lib/protocols/mqtt/topicMatch.test.ts` | new | 매칭 규칙 테스트 |
| `src/lib/protocols/mqtt/MqttWebSocketClientAdapter.ts` | new | 주입 계약 + 어댑터 |
| `src/lib/protocols/mqtt/MqttWebSocketClient.test.ts` | new | 인라인 `FakeClient` + 어댑터·파사드·주입계약 테스트 |
| `src/lib/protocols/mqtt/MqttWebSocketClient.ts` | new | 파사드 |
| `src/lib/protocols/mqtt/index.ts` | new | 배럴 |
| `AGENTS.md` | modified | 주입 규칙 1줄 |
| `README.md` | modified | MQTT 사용법 절 (STOMP와 동일 대우) |
| `bun.lockb` | **미변경** | bun 미설치 — 낡은 상태로 남김, PR에 명시 |

`src/lib/WebSocketClient.ts`와 `src/lib/protocols/stomp/`는 **수정하지 않는다.**

## Verification

```bash
npm test
npm run lint
npm run build   # 타입/공개 export 변경이 있으므로 필수
```

기대: **0단계 기준선 대비 새로 생긴 실패 0건.** 기준선이 이미 실패 중이면
그 실패는 이번 변경과 분리해 보고한다 (없는 통과를 주장하지 않는다).
AC1/AC2는 grep과 `package.json` 확인으로 별도 검증.

## Rollback

- 코드: 브랜치 삭제 또는 revert 커밋.
- **코드로 되돌아가지 않는 것:** `npm install`로 바뀐
  `package.json`/`package-lock.json`. 되돌릴 때
  `npm uninstall mqtt` 를 함께 실행해야 한다.
- `bun.lockb`는 이번 작업에서 갱신하지 않으므로 롤백 대상도 아니다. 다만
  `npm`/`bun` 락파일 불일치는 이 작업과 무관하게 남아 있는 문제다.

## Deviations

**0단계 기준선 (2026-09-09, `npm install` 직후, 코드 변경 전):**

```
npm test        → 1 test file, 6 tests passed
npm run lint    → Checked 28 file(s), 진단 0건
npm run build   → tsc 통과 + vite build 성공 (dist/assets/index.4e2179d7.js)
```

세 명령 모두 통과. 따라서 이후 종료 조건은 "기준선 대비 새 실패 0건" = **3개 모두 통과**다.

**계획과 다르게 한 것:**

1. **`npm overrides` 추가 (계획에 없던 결정).** `mqtt@5.14.0`이
   `@types/readable-stream`·`@types/ws` 경유로 `@types/node@26.5.0`을 끌어와
   root TypeScript 4.9.5가 `ffi.d.ts`를 파싱하지 못해 `tsc`가 50개 에러로
   죽었다. `skipLibCheck: true`는 구문 오류를 막지 못한다.
   `compilerOptions.types: []`는 실패(mqtt의 d.ts가 @types/node를 직접 끌어옴).
   `overrides: { "@types/node": "^20" }`로 0 에러. 대안인 root TS 5.x 업그레이드는
   영향 범위가 커서 보류하고 `review.md`에 정책으로 남겼다.
2. **테스트 파일 구성이 계획과 다르다.** 처음에 페이크를 `FakeMqttClient.ts`로
   빼고 테스트를 2개 파일로 나눴는데, 이 저장소는 테스트 더블을 `.test.ts` 안에
   인라인으로 두고(`FakeAdapter`, `WebSocketClient.test.ts:9`) 모듈 영역당 테스트
   파일 하나를 쓴다. 관례에 맞춰 되돌렸다: 페이크는 `FakeClient`로 인라인 선언,
   어댑터·파사드·주입계약 테스트를 `MqttWebSocketClient.test.ts` 하나로 통합.
   `src/`의 비-`.test.ts` 파일에 테스트 코드는 0건.
3. **AC3를 8단계가 아니라 5단계 앞에서 먼저 확인했다.** 주입 계약이 설계 전체의
   전제라, 어댑터를 다 쓴 뒤 깨지면 손실이 크기 때문. 결과는 통과.
4. **적대적 리뷰 단계를 삽입했다(9.5단계).** `gpt-5.3-codex-spark`로 spec·plan을
   적대적 검토 → 주장별 코드 재검증 → `review.md`에 채택 6건·기각 4건 판정 →
   AC10–AC17 추가. 실제 버그 2건(connect 영구 hang, 리스너 중복 등록)을 잡았다.
5. **연결 테스트 3티어를 추가했다(계획에 없던 범위).** `aedes`를 devDep으로
   추가, `vitest.config.ts`/`vitest.integration.config.ts`로 티어 분리,
   `mqtt.integration.test.ts` 7개, `main.ts`에 수동 데모 분기.
   `aedes-server-factory`는 설치했다가 제거했다 — ws 경로가 동작하지 않았다
   (ws 서버가 `mqtt` 서브프로토콜을 선택하지 않아 클라이언트가 무증상 실패).
   자동 티어는 TCP 브로커로 확정하고 ws 경로는 수동 티어 + `MQTT_TEST_BROKER_URL`
   opt-in에 맡겼다.
6. **AC10–AC17은 red-first가 아니다.** 리뷰 반영 시 어댑터를 먼저 고치고 테스트를
   뒤에 썼다. 계획의 TDD 순서를 지키지 못한 지점이다.

기준선 관련 예측 수정: spec 리스크에 "Biome lint가 이미 빨간불일 가능성"을 적었으나
틀렸다. `npm run lint`는 `biome lint`로 포매팅을 검사하지 않으므로 `main.ts`의
큰따옴표는 lint를 깨뜨리지 않는다. `npm install`은 `package.json`/
`package-lock.json`/`bun.lockb`를 변경하지 않았다.
