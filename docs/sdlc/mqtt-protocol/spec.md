# Spec: MQTT 프로토콜 어댑터 (모듈 외부 주입)

- **Intent:** `docs/sdlc/mqtt-protocol/intent.md`
- **Date:** 2026-09-09
- **Status:** accepted
- **Owner:** hsshin
- **적대적 리뷰 판정:** `docs/sdlc/mqtt-protocol/review.md`

## Scope

`src/lib/protocols/mqtt/`에 MQTT 어댑터와 클라이언트 파사드를 추가한다.
저장소는 `mqtt` 모듈을 **런타임에 import하지 않는다.** 호출자가 `mqtt.connect`
함수를 주입하고, 어댑터는 구조적(structural) 인터페이스만 알고 동작한다.
**클래스명·필드명·메서드 구조는 `src/lib/protocols/stomp/`를 그대로 미러링**한다.
검증용 주입 모듈은 `mqtt@5.14.0`을 **devDependency로만** 설치해 타입 호환성과
통합 동작을 테스트한다.

## Out of scope

- `mqtt`를 `dependencies`에 추가하는 것 (devDependency만, 테스트 전용).
- MQTT 5 전용 기능: shared subscription, topic alias, user property, QoS 2
  재전송 제어. QoS는 옵션으로 통과시키기만 한다.
- Worker(`src/lib/workers/`) 경유 MQTT. 이번엔 메인 스레드만.
- `retain`/`will` 전용 API. 옵션 통과만, 별도 래핑 없음.
- **콜백 단위 구독 해제.** `unsubscribe(filter)`는 그 필터의 콜백 전체를 해제한다
  (review.md D2).
- **공유 구독 지원.** `$share/...` 필터는 지원하지 않고 `onError`로 명시적으로
  거부한다 (review.md S2).
- **강제 종료 플래그.** `disconnect(force)`는 노출하지 않는다.
  `IWebSocketClient.disconnect(): void`가 3개 프로토콜의 공유 계약이다.

## Acceptance criteria

- [ ] **AC1** — `package.json`의 `dependencies`에 `mqtt`가 없다.
- [ ] **AC2** — `src/lib/protocols/mqtt/` 의 비테스트 파일에서 `mqtt` import가
      0건. 검증: `grep -rn "from 'mqtt'" src/lib/protocols/mqtt`
- [ ] **AC3** — 실제 `mqtt@5.14.0`의 `connect`가 `MqttConnect`에 **컴파일
      타임에** 대입 가능하다. `import { connect } from 'mqtt'` **명명 임포트**를
      쓴다 (default export 유무에 의존하지 않기 위해). 검증: `npm run build`.
- [ ] **AC4** — 와일드카드 매칭: `sensor/+/temp` 구독 시 `sensor/a/temp` 호출,
      `sensor/a/b/temp` 미호출. `sensor/#` 구독 시 `sensor/a/b` 호출.
      `#`/`+` 구독이 `$SYS/...` 를 잡지 않는다.
- [ ] **AC5** — 바이너리 payload가 UTF-8 문자열로 디코딩되어 콜백에 전달된다.
- [ ] **AC6** — `WebSocketClient` 파이프라인 연결: `onConnect`/`onError`/
      `onClose`와 `messages$`가 MQTT 이벤트에서 발화하고, README에 문서화된 훅
      순서(`onBeforeConnect` → adapter connect → `onAfterConnect`)가 실제로
      실행된다. 파사드가 `connect()`를 오버라이드하지 않는 것으로 보장한다.
- [ ] **AC7** — `disconnect()`가 주입 클라이언트의 `end()`를 호출한다.
      `networkStatus()`는 `connected` 여부를 `WebSocket.OPEN`/`WebSocket.CLOSED`
      로 반환한다 (`WindowWebSocketClientAdapter`와 동일한 상수 사용).
- [ ] **AC8** — `unsubscribe(topic)`가 `subscriptions` 레코드 삭제뿐 아니라
      주입 클라이언트의 `unsubscribe(topic)`도 호출한다 (STOMP 어댑터는 레코드만
      지우고 브로커에 알리지 않는 버그가 있어 이를 복제하지 않는다).
- [ ] **AC10** — 연결이 `'error'`로 실패하면 `connect()`가 reject된다 (B1).
- [ ] **AC11** — `connect()`를 두 번 불러도 리스너가 중복 등록되지 않는다 (B2).
- [ ] **AC12** — 구독 콜백이 `(message, topic)`을 받는다 (D1).
- [ ] **AC13** — 같은 필터를 두 번 구독하면 두 콜백 모두 호출된다 (D2).
- [ ] **AC14** — 연결 전 `subscribe()`가 연결 성립 후 브로커에 등록된다 (D3).
- [ ] **AC15** — 구독 실패가 `onError`로 전달된다 (D4).
- [ ] **AC16** — `publish`/`subscribe` 옵션이 주입 클라이언트로 전달된다 (S1).
- [ ] **AC17** — `$share/` 필터 구독이 `onError`로 거부된다 (S2).
- [ ] **AC18** — 통합 티어가 실제 브로커 상대로 통과한다
      (`npm run test:integration`).
- [ ] **AC19** — 데모가 MQTT를 지연 로드해 메인 번들에 어댑터·`mqtt`가 들어가지
      않는다.
- [ ] **AC9** — 새로 추가한 파일에 대해 `npm test`, `npm run lint`,
      `npm run build`가 통과한다. 저장소 기준선이 이미 실패 중이면 그 실패는
      분리해 보고하고 이번 변경으로 새로 생긴 실패만 0건으로 만든다.

## Design

### 새 파일 (STOMP 폴더와 동일한 구성)

```
src/lib/protocols/mqtt/MqttWebSocketClientAdapter.ts
src/lib/protocols/mqtt/MqttWebSocketClient.ts
src/lib/protocols/mqtt/topicMatch.ts
src/lib/protocols/mqtt/index.ts
src/lib/protocols/mqtt/MqttWebSocketClient.test.ts   # 어댑터+파사드 통합
```

### 주입 계약

```ts
export type MqttMessageListener = (topic: string, payload: Uint8Array) => void;

/** mqtt 쪽 구독·언구독·발행 완료 콜백 (실패를 onError로 잇기 위함) */
export type MqttOperationCallback = (error?: Error | null) => void;

export interface IMqttClient {
  connected?: boolean;
  subscribe(
    topic: string | string[],
    options?: unknown,
    callback?: MqttOperationCallback,
  ): unknown;
  unsubscribe(
    topic: string | string[],
    options?: unknown,
    callback?: MqttOperationCallback,
  ): unknown;
  publish(
    topic: string,
    message: string,
    options?: unknown,
    callback?: MqttOperationCallback,
  ): unknown;
  end(force?: boolean): unknown;
  on(event: 'message', listener: MqttMessageListener): unknown;
  on(event: 'connect' | 'close', listener: () => void): unknown;
  on(event: 'error', listener: (error: Error) => void): unknown;
}

/** 구독 콜백은 topic을 두 번째 인자로 받는다 (review.md D1) */
export type MqttMessageCallback = (message: string, topic: string) => void;

export type MqttConnect<TOptions = unknown> = (
  url: string,
  options?: TOptions,
) => IMqttClient;

export interface MqttWebSocketClientAdapterOptions<TOptions = unknown> {
  brokerURL: string;
  connect: MqttConnect<TOptions>;
  connectOptions?: TOptions;
}
```

- 필드명 `brokerURL`은 `StompWebSocketClientAdapterOptions`와 동일하게 맞춘다.
- 메서드 문법 선언 → TS 메서드 파라미터 bivariance로 실제 `mqtt.MqttClient`가
  옵션 타입 차이에도 구조적으로 대입된다.
- `TOptions`는 호출자의 `mqtt.connect`에서 추론된다. STOMP처럼 개별 옵션 필드를
  펼치지 않는 이유: 펼치려면 `IClientOptions`를 import해야 하고 그건 주입 원칙에
  어긋난다. → `connectOptions` 한 덩어리로 통과시킨다. (STOMP와의 유일한 옵션
  구조 차이)

### 명명 규칙 근거

`src/`의 기존 선언을 grep해 뽑은 규칙을 따른다. 관례에 없는 접미사는 새로
들여오지 않는다.

| 대상 | 저장소 규칙 (근거) | 이 스펙의 이름 |
|------|-------------------|----------------|
| 동작 계약 인터페이스 | `I` 접두사 — `IWebSocketPlugin`, `IWebSocketClient`, `IWebSocketClientAdapter` | `IMqttClient` |
| 함수형 타입 별칭 | 접미사 없는 명사 — `Unsubscribe = () => void` (표본 1건) | `MqttConnect` |
| 옵션 타입 | `<클래스명>Options` — `StompWebSocketClientAdapterOptions` | `MqttWebSocketClientAdapterOptions` |
| 불리언 반환 함수 | `is` 접두사 — `isString` (`src/lib/utils.ts`, 표본 1건) | `isTopicMatch` |
| 능력 인터페이스 | `-Able` 접미사, `I` 없음 — `PubSubAble<T>` | `PubSubAble<T>` 재선언 |
| 테스트 더블 | `Fake` 접두사 — `FakeAdapter` (`WebSocketClient.test.ts`) | `FakeMqttClient` |

### 어댑터 (STOMP 미러링)

```ts
interface PubSubAble<T> { /* stomp 어댑터와 동일한 형태를 로컬 선언 */ }

export class MqttWebSocketClientAdapter<TOptions = unknown>
  extends WebSocketClientAdapter<IMqttClient>
  implements PubSubAble<MqttSubscription>
{
  #brokerURL: string;
  #connect: MqttConnect<TOptions>;
  #connectOptions?: TOptions;

  protected client?: IMqttClient;
  subscriptions: Record<string, MqttSubscription> = {};
  onConnectCallback: (() => void) | undefined;
  onMessageCallback: (data: string) => void = () => {};
  onErrorCallback: ((error: Error) => void) | undefined;
  onCloseCallback: (() => void) | undefined;

  constructor(
    options: MqttWebSocketClientAdapterOptions<TOptions>,
    client?: IMqttClient,
  );
}
```

- `#`-private 옵션 필드, `protected client?`, 4개의 `on*Callback` 공개 필드,
  `subscriptions: Record<...>` — 모두 STOMP 어댑터와 동일한 이름/가시성.
- 공개 `subscribe`/`unsubscribe`/`publish`/`isSubscribed`가 배열을 순회하고
  단건 처리를 `_subscribe`/`_unsubscribe`/`_publish`/`_isSubscribed`에 위임하는
  구조도 동일.
- `MqttSubscription = { filter: string; callback: (message: string) => void }`
  — STOMP의 `subscriptions[topic] = StompSubscription`과 같은 자리에 들어간다.
- `send()`는 STOMP와 동일하게 `throw new Error('Method not implemented.')`.

**적대적 리뷰에서 확정된 어댑터 동작** (근거는 `review.md`):

| # | 동작 |
|---|------|
| B1 | 최초 연결 확정 전의 `'error'`는 connect Promise를 **reject**한다. 연결 성립 후의 에러는 `onErrorCallback`으로만 간다 |
| B2 | 리스너 등록은 한 번만. `connect()` 재호출은 진행 중인 같은 Promise를 반환한다 |
| D1 | 구독 콜백은 `(message, topic)`을 받는다 |
| D2 | `subscriptions[filter]`가 콜백 **집합**(`Set`)을 담아 필터당 다중 구독을 허용한다 |
| D3 | 연결 전 `subscribe()`는 레코드에 보관하고 연결 성립 직후 브로커에 일괄 등록한다 |
| D4 | mqtt의 구독·언구독·발행 콜백을 받아 에러면 `onErrorCallback`으로 보낸다 |
| S1 | `publish(topic, message, options?)` / `subscribe(topic, cb, options?)`로 QoS·retain을 통과시킨다 |
| S2 | `$share/` 필터는 구독하지 않고 `onErrorCallback`으로 미지원을 알린다 |

**STOMP를 의도적으로 따르지 않는 3곳** (모두 STOMP 쪽 결함으로 판단):

| 항목 | STOMP 현재 동작 | 이 스펙 |
|------|----------------|---------|
| `networkStatus()` | `throw new Error('Method not implemented.')` → `status()` 사용 불가 | `this.client?.connected ? WebSocket.OPEN : WebSocket.CLOSED` (`WindowWebSocketClientAdapter`와 동일 상수) |
| `_unsubscribe(topic)` | `delete this.subscriptions[topic]`만 실행 — 브로커에 해제를 알리지 않아 메시지가 계속 들어옴 | 레코드 삭제 + 주입 클라이언트의 `unsubscribe(topic)` 호출 |
| 파사드 `connect()`/`disconnect()` | 오버라이드해서 플러그인 훅을 건너뜀 | 오버라이드하지 않음 (위 파사드 절 참고) |

### 파사드

```ts
export type MqttWebSocketClientOptions<TOptions = unknown> =
  MqttWebSocketClientAdapterOptions<TOptions> & WebSocketClientOptions;

export class MqttWebSocketClient<TOptions = unknown>
  extends WebSocketClient<IMqttClient> {
  constructor(options: MqttWebSocketClientOptions<TOptions>);
  private get adapter(): MqttWebSocketClientAdapter<TOptions>;
  publish(topic: string | string[], message: string): void;
  subscribe(topic: string | string[], cb: (message: string) => void): void;
  unsubscribe(topic: string | string[]): void;
  isSubscribed(topic: string | string[]): boolean;
}
```

- `MqttWebSocketClientOptions` 이름과 합성 방식은
  `WindowWebSocketClientOptions = WebSocketClientOptions & { url, logger }`
  (`WebSocketClient.ts:65`)를 따른다.
- **`connect()` / `disconnect()`를 오버라이드하지 않는다.** `StompWebSocketClient`
  는 이 둘을 오버라이드해 `this.client.connect()`를 직접 호출하는데, 그러면
  `WebSocketClient.connect()`가 감싸는 플러그인 훅
  (`onBeforeConnect` → adapter connect → `onAfterConnect`)이 전부 건너뛰어진다.
  README "Plugins" 절이 이 순서를 공개 동작으로 문서화하고 있어, STOMP의 이
  오버라이드는 따라야 할 관례가 아니라 버그로 판단한다. 기본 클래스의
  `connect()`/`disconnect()`를 그대로 상속하면 AC6이 자동으로 성립한다.
- `WindowWebSocketClient`처럼 `plugins`/`logger`를 `super`로 넘긴다.
  `StompWebSocketClient`는 이 둘을 버려서 STOMP 사용자는 플러그인을 못 쓰는데,
  README의 주 사용 예시가 `plugins: [new LoggingPlugin(logger)]`이므로
  `WindowWebSocketClient` 쪽을 선례로 삼는다.

사용 예 (호출자 쪽, 저장소 밖):

```ts
import { connect } from 'mqtt'; // 버전은 호출자가 고정
const client = new MqttWebSocketClient({
  brokerURL: 'wss://broker.example.com:8884/mqtt',
  connect,
  connectOptions: { clientId: 'web-1', clean: true },
  plugins: [new LoggingPlugin(console)],
  logger: console,
});
await client.connect();
```

### STOMP와 다른 점 — 메시지 디스패치

STOMP는 구독마다 콜백을 받지만 MQTT는 **모든 메시지가 단일 `message` 이벤트**로
들어오고 수신 topic이 구독 필터와 다를 수 있다. 그래서:

- `subscriptions`(필터 → 구독) 를 순회하며 `isTopicMatch(filter, topic)`이 참인
  구독의 콜백만 호출한다.
- `isTopicMatch`는 MQTT 규칙 구현: `+`는 한 레벨, `#`은 남은 전체(마지막 세그먼트
  에서만 허용), 와일드카드 시작 구독은 `$`로 시작하는 topic을 매칭하지 않음.
- payload는 `TextDecoder`로 UTF-8 디코딩해 기존 string 콜백 계약에 맞춘다.

## Approaches considered

| Approach | Trade-off | Verdict |
|----------|-----------|---------|
| **A (선택)** `connect` 팩토리 주입 + 제네릭 옵션 | 어댑터가 연결 수명주기를 소유해 STOMP 어댑터와 대칭. 호출자는 함수 하나만 넘김 | **추천.** `connect()` 안에서 클라이언트를 만드는 STOMP 구조를 그대로 유지 |
| B 완성된 client 인스턴스 주입 | 가장 단순하지만 `connect()`에서 만들 게 없어 수명주기가 호출자에 흩어짐 | 기각 — 단, STOMP처럼 2번째 생성자 인자로 남겨 테스트 페이크 주입에 사용 |
| C 모듈 네임스페이스 전체 주입 | 실제로 쓰는 건 `connect` 하나뿐인데 표면이 넓어짐 | 기각 |

## Constraint check

- [x] Strict TS clean — `any` 미사용, 미사용 파라미터 없음
- [x] Biome format (2-space, 80 col, single quotes)
- [x] `src/`에 하드코딩 URL/시크릿 없음 — `brokerURL`/`connectOptions` 주입
- [x] `src/lib/WebSocketClient.ts` native-only 유지 (수정 없음)
- [x] `src/lib/protocols/mqtt/` 격리 + opt-in
- [x] 서드파티 모듈 주입 — `dependencies` 추가 없음, 테스트만 devDependency
- [x] Worker 미변경

## Test strategy — 3티어 독립 구성

- **페이크 클라이언트 단위 테스트**(브로커 없음): `IMqttClient`를 구현한
  `FakeClient`로 subscribe/publish/wildcard/decode/close 검증 (AC4–AC7).
  `src/lib/WebSocketClient.test.ts`의 `FakeAdapter` 패턴을 따른다 — 페이크는
  테스트 파일 안에 인라인 선언하고 export하지 않는다. 이 저장소는 테스트
  더블을 별도 소스 모듈로 두지 않는다.
- **타입 호환성 테스트**: `mqtt@5.14.0`을 devDependency로 설치하고
  `import { connect } from 'mqtt'` 후 `const fn: MqttConnect<...> = connect`
  대입 (AC3). 검증자는 `tsc`. `tsconfig.json`의 `include: ["src"]`가 테스트
  파일까지 포함하므로 `npm run build`가 이 어서션을 실제로 검사한다.
- **테스트 스타일**: `src/lib/WebSocketClient.test.ts`를 따른다 — `describe`/`it`
  영문 설명, `vi.fn()`, `vi.waitFor()`, 스파이는 `sentPayloads` 같은 공개 배열.
- **격리 검증**: grep 기반 (AC2).
- **통합 티어**(`npm run test:integration`, `vitest.integration.config.ts`):
  인프로세스 `aedes` 브로커를 **TCP**로 띄우고 실제 `mqtt`를 주입한다. 페이크가
  증명할 수 없는 것만 본다 — `isTopicMatch`와 브로커 실제 매칭의 일치,
  QoS·retain 실효, 연결 전 구독의 브로커 등록, 브로커 부재 시 reject.
- **수동 브라우저 티어**: `VITE_MQTT_BROKER_URL`로 실제 ws 브로커를 겨냥해
  `npm run dev`. WebSocket 전송 경로는 이 티어가 담당한다.
- **의도적 미테스트**: QoS 2 재전송 세부, 재연결 백오프, 자동 티어의 WebSocket
  전송 경로(`MQTT_TEST_BROKER_URL`로 opt-in 가능).

## Risks

- **실제 `mqtt` 타입이 구조적으로 안 맞을 수 있음** → 가장 싼 신호: AC3의 `tsc`
  실패. 그때는 `IMqttClient` 시그니처를 더 느슨하게 조정한다.
- **타입 해석 자체가 실패할 수 있음.** 루트 `tsconfig.json`이
  `moduleResolution: "Node"`(TS 레거시 Node10 해석기)라서 `mqtt` v5의
  `exports` 맵을 읽지 않고 `types: build/index.d.ts`만 본다. 루트 TypeScript는
  `^4.6.4`로 오래됐다. → 싼 신호: AC3에서 `Cannot find module 'mqtt'` 또는
  구문 오류. 완화: `skipLibCheck: true`가 이미 켜져 있어 mqtt d.ts 내부 오류는
  건너뛴다. 그래도 막히면 `moduleResolution` 변경은 저장소 전체에 영향을 주므로
  **spec을 다시 열고 합의한다** (임의로 tsconfig를 바꾸지 않는다).
- **락파일 드리프트.** `package-lock.json`과 `bun.lockb`가 둘 다 있고 `bun`은
  이 머신에 없다. `npm install`로 devDependency를 추가하면 `bun.lockb`만
  낡는다. → 싼 신호: `git status`에 `package-lock.json`만 변경됨. 이번 작업에서
  `bun.lockb`는 손대지 않고 그 사실을 PR에 적는다.
- **기준선 미확인.** `node_modules`가 없어 현재 `npm test`/`lint`/`build`가
  통과하는지 알 수 없다. `main.ts`는 큰따옴표를 쓰는데 Biome은 작은따옴표를
  강제하므로 lint가 이미 빨간불일 가능성이 있다. → plan 0단계에서 기준선을
  먼저 기록하고, 기존 실패와 새 실패를 분리해 보고한다.
- **Node 버전 불일치.** `.nvmrc`는 `22`인데 현재 셸은 `v26.8.1`이다. Vite 3 /
  TypeScript 4.6은 오래된 조합이라 Node 26에서 예상 밖 동작이 날 수 있다.
  → 싼 신호: 0단계 `npm install` 또는 기준선 명령의 실패.
- **와일드카드 매칭 버그** → 싼 신호: AC4의 케이스 표(`+`, `#`, `$SYS`).
- **devDependency가 번들에 새는 것** → 싼 신호: AC1/AC2 + 빌드 산출물 확인.
