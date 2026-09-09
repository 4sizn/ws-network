# Intent: MQTT 네트워크 버전 추가

- **Date:** 2026-09-09
- **Status:** accepted (대화로 합의, 2026-09-09)
- **Owner:** hsshin

## 원래의 요청

> "mqtt 모듈을 외부에서 주입받은 식으로 해서 mqtt 네트워크 버전용도 만들고싶어."

## 문제

`ws-network`는 현재 native WebSocket(`WindowWebSocketClient`)과 STOMP
(`src/lib/protocols/stomp/`) 두 가지만 지원한다. MQTT 브로커를 쓰는 쪽에서는
이 라이브러리를 그대로 쓸 수 없다.

## 오늘의 상태와 부족한 점

- STOMP 어댑터는 `@stomp/stompjs`를 **직접 import**하고 `package.json`
  dependencies에 고정되어 있다. 프로토콜을 하나 늘릴 때마다 라이브러리 버전이
  이 저장소에 묶이고, 그 프로토콜을 안 쓰는 사용자도 의존성을 받는다.
- `mqtt` 패키지는 무겁고(브라우저 번들 기준) 버전 정책이 사용처마다 다르다.
  이 저장소가 버전을 고정하면 안 된다.

## 제안 방향 (얇게 — 설계는 Stage 2)

MQTT 클라이언트 모듈을 저장소가 import하지 않고 **호출자가 주입**한다.
`src/lib/protocols/mqtt/`에 격리하고 opt-in으로 둔다.

## 성공 판단 기준

- 이 저장소의 `package.json`에 `mqtt` 의존성이 추가되지 않는다.
- MQTT를 쓰지 않는 사용자의 번들에 MQTT 코드가 들어가지 않는다.
- 테스트가 실제 브로커 없이 돈다.
