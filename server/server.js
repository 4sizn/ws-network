const WebSocket = require('ws');

// 8010 포트에서 WebSocket 서버 생성
const wss = new WebSocket.Server({ port: 8010 });

console.log('WebSocket 서버가 ws://localhost:8010 에서 실행 중입니다');

// 클라이언트 연결 처리
wss.on('connection', (ws) => {
  console.log('클라이언트가 연결되었습니다');

  // 클라이언트로부터 메시지 수신
  ws.on('message', (message) => {
    console.log(`클라이언트로부터 받은 메시지: ${message}`);

    // 에코 응답 (예시)
    ws.send(`서버 응답: ${message}`);
  });

  // 연결 종료 처리
  ws.on('close', () => {
    console.log('클라이언트 연결이 종료되었습니다');
  });

  // 오류 처리
  ws.on('error', (error) => {
    console.error('WebSocket 오류:', error);
  });

  // 연결 성공 메시지 전송
  ws.send('서버에 연결되었습니다!');
});

// 서버 오류 처리
wss.on('error', (error) => {
  console.error('서버 오류:', error);
});
