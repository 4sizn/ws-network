# iNetwork 테스트 서버

이 프로젝트는 iNetwork 라이브러리의 WebSocket 클라이언트 코드를 테스트하기 위한 독립적인 서버 프로젝트입니다.

## 설치 방법

```bash
# 서버 디렉토리로 이동
cd server

# 의존성 설치
npm install
```

## 실행 방법

### 기본 WebSocket 서버 실행

```bash
npm start
```

기본 서버는 단순한 WebSocket 서버로, 에코 응답만 제공합니다.

### 개발 테스트 서버 실행

```bash
npm run dev
```

개발 테스트 서버는 다음과 같은 기능을 제공합니다:

- 웹 기반 테스트 클라이언트 UI
- 다양한 테스트 시나리오
- 클라이언트 연결 모니터링
- JSON 메시지 자동 처리
- 로깅 기능

## 접속 주소

- WebSocket 엔드포인트: `ws://localhost:8010`
- 웹 테스트 클라이언트: `http://localhost:8010/`
- 서버 상태 페이지: `http://localhost:8010/stats`

## 테스트 시나리오

개발 테스트 서버에서는 다음과 같은 특수 명령어를 사용할 수 있습니다:

- `ECHO_TEST`: 에코 테스트
- `FORCE_DISCONNECT`: 강제 연결 해제
- `SIMULATE_ERROR`: 오류 시뮬레이션
- `PING`: 핑/퐁 테스트

## 클라이언트 연결 예시

```javascript
// 브라우저 환경
const socket = new WebSocket("ws://localhost:8010");
const plugin = new WindowWebSocketClientPlugin(socket);
const client = new WindowWebSocketClient(plugin);

// 웹소켓 클라이언트 매니저에 등록
const manager = WebSocketClientsManager.getInstance();
manager.install("window-WS", client);

// 메시지 수신 이벤트 리스너 설정
client.onMessage((data) => {
  console.log('서버로부터 메시지 수신:', data);
});

// 연결 시작
client.connect();

// 메시지 전송
client.send('안녕하세요 서버!');
```

## 설정 변경

`dev-server.js` 파일의 상단에 있는 `config` 객체를 수정하여 서버 설정을 변경할 수 있습니다:

```javascript
const config = {
  port: 8010,                       // 서버 포트
  logToFile: true,                  // 파일 로깅 여부
  logFilePath: './logs/websocket.log',  // 로그 파일 경로
  autoRespond: true,                // 자동 응답 여부
  simulateLatency: 0,               // 응답 지연 시간 (밀리초)
  scenarios: {                      // 테스트 시나리오 활성화 여부
    echo: true,
    forceDisconnect: true,
    simulateError: true
  }
};
```

## 프로젝트 구조

```
server/
  ├── package.json        # 의존성 및 스크립트 정의
  ├── server.js           # 기본 WebSocket 서버
  ├── dev-server.js       # 개발 테스트 WebSocket 서버
  ├── logs/               # 로그 파일 디렉토리
  └── README.md           # 이 문서
``` 