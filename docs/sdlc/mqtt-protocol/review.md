# 적대적 리뷰 판정: MQTT 주입형 어댑터

- **Spec:** `docs/sdlc/mqtt-protocol/spec.md`
- **Date:** 2026-09-09
- **리뷰어:** `gpt-5.3-codex-spark` (codex exec, read-only 샌드박스, detached 워크트리)
- **판정자:** 이 저장소 작업자 — 리뷰 주장을 코드로 재검증한 뒤 채택/기각

리뷰 원문: `scratchpad/review-out.md` (75,272 토큰 사용, exit 0)

## 기각

| 리뷰 주장 | 기각 근거 |
|-----------|-----------|
| `@types/node@^20` 오버라이드가 **미검증**이다 | 실측으로 검증됨: `npx tsc --noEmit` 0 에러, `npm run build` 통과. 리뷰는 `package.json`의 선언 `typescript: ^4.6.4`만 읽고 실제 해석 버전이 **4.9.5**인 것을 확인하지 않았다 |
| `subscribe`/`unsubscribe`를 `Promise<boolean>`/`Result` 반환으로 바꿔라 | 과도하다. `WebSocketClientAdapter`의 계약은 native·STOMP 모두 동기 `void`이고, 실패 전달 채널은 `onError`가 이미 존재한다. 최소 정답은 mqtt 콜백을 `onError`로 잇는 것 |
| `disconnect(force?: boolean)`을 노출하라 | `IWebSocketClient.disconnect(): void`가 공유 계약이다(`WebSocketClient.ts:79`). 강제 종료 플래그 하나를 위해 3개 프로토콜의 공통 시그니처를 바꿀 이유가 없다. 미노출을 문서화한다 |
| 실제 브로커 E2E가 없다 | spec Out of scope에 이미 명시돼 있다. 잔존 리스크로만 남긴다 |

## 채택 — 실제 버그 2건

### B1. `connect()`가 실패 시 영구 hang한다

`connect()`의 Promise가 `'connect'` 이벤트에서만 resolve되고 `'error'`에
reject 경로가 없다(`MqttWebSocketClientAdapter.ts:87`). 브로커 연결이 실패하면
`WebSocketClient.connect()`가 끝나지 않고, `src/main.ts:229`의
`client.connect().then(...)`이 영구 대기한다.

**정답:** 최초 연결 확정 전의 `'error'`는 Promise를 reject한다. 연결 성립 이후의
`'error'`는 기존대로 `onErrorCallback`으로만 보낸다(재연결 중 에러가 연결
Promise를 깨서는 안 된다).

### B2. `connect()` 재호출이 리스너를 중복 등록한다

`connect()`는 매번 `client.on(...)`을 4번 부른다. `this.client`가 재사용되므로
두 번 호출하면 리스너가 2배가 되고 메시지·에러 콜백이 중복 호출된다.

**정답:** 리스너 등록을 한 번만 하도록 가드한다. 이미 연결이 진행/성립된 상태의
재호출은 같은 Promise를 반환한다.

## 채택 — 설계 결함 4건

### D1. 와일드카드 구독자가 수신 topic을 알 수 없다

`sensor/+/temp`를 구독하면 콜백은 `'21.5'`만 받고 그게 `sensor/a/temp`인지
`sensor/b/temp`인지 알 방법이 없다. 와일드카드가 존재하는 프로토콜에서 이건
기능 손실이다.

**정답:** 콜백 시그니처를 `(message: string, topic: string) => void`로 **추가
인자**로 확장한다. 기존 `(message) => void` 콜백은 추가 인자를 무시하므로
호환이 깨지지 않고, `WebSocketClient`의 문자열 계약(`messages$`)도 그대로 둔다.
리뷰가 제안한 `onMessageWithTopic` 별도 채널보다 표면이 작다.

### D2. 같은 필터를 두 번 구독하면 앞 콜백이 사라진다

`subscriptions[topic] = { filter, callback }`이 같은 키를 덮어쓴다.

**정답:** `Record<string, MqttSubscription>` 형태는 STOMP 미러링을 위해 유지하고,
레코드 안에 `callbacks: Set<MqttMessageCallback>`을 담아 필터당 여러 콜백을
허용한다. `unsubscribe(topic)`은 그 필터 전체를 해제한다(콜백 단위 해제는
이번 범위 밖 — spec Out of scope에 적는다).

### D3. 연결 전 `subscribe()`가 조용히 버려진다

`_subscribe`가 `if (!this.client) return;`으로 즉시 반환한다. `src/main.ts`는
`onConnect`/`onMessage`를 먼저 등록하고 `connect()`를 나중에 부르는 순서라
실사용에서 반드시 걸린다.

**정답:** 연결 전 구독을 레코드에 보관하고 `connect()` 성립 직후 브로커에 일괄
등록한다. 버리지 않는다.

### D4. 구독/언구독 실패가 어디에도 전달되지 않는다

mqtt의 `subscribe(topic, opts, callback)` 콜백과 반환값을 모두 버리고 있다.
ACL 거부, 잘못된 필터, 네트워크 실패가 조용히 사라진다.

**정답:** mqtt 콜백을 받아 에러면 `onErrorCallback`으로 보낸다. `IMqttClient`의
`subscribe`/`unsubscribe` 시그니처에 선택적 콜백 인자를 추가한다.

## 채택 — 명세 공백 2건

### S1. QoS·retain 옵션이 통과되지 않는다

spec Out of scope는 "QoS는 옵션으로 통과시키기만 한다"고 적었는데 구현은
`client.publish(topic, message)`로 옵션을 아예 넘기지 않는다. **spec과 구현이
모순**이다.

**정답:** `publish(topic, message, options?)`와 `subscribe(topic, cb, options?)`에
옵션 통과 인자를 두고 주입 클라이언트로 그대로 넘긴다. spec 문구와 일치시킨다.

### S2. 공유 구독(`$share/...`)이 조용히 아무것도 받지 않는다

`isTopicMatch('$share/g/sensor/+', 'sensor/a')`는 첫 레벨 비교에서 `false`가 되어
구독자가 영원히 메시지를 못 받는다. spec은 Out of scope로 적었지만 동작은
"조용한 미수신"이다.

**정답:** 리뷰의 (B)안 — 명시적 거부. `$share/`로 시작하는 필터로 구독하면
`onError`로 미지원을 알린다. 조용히 실패하지 않게 한다. 완전 지원(A안)은 범위
대비 복잡도가 크다.

## 우선순위

| # | 항목 | 등급 |
|---|------|------|
| 1 | B1 connect reject 경로 | 필수 — 영구 hang |
| 2 | B2 리스너 중복 등록 가드 | 필수 — 콜백 중복 |
| 3 | D3 연결 전 구독 큐잉 | 필수 — 실사용 순서에서 반드시 발생 |
| 4 | D1 콜백에 topic 전달 | 필수 — 와일드카드 기능 손실 |
| 5 | D2 필터당 다중 콜백 | 높음 |
| 6 | D4 구독 실패 → onError | 높음 |
| 7 | S1 QoS·retain 옵션 통과 | 중간 — spec 모순 해소 |
| 8 | S2 `$share` 명시적 거부 | 중간 |
