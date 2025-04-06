import {
  WebSocketClient,
  windowWebsocket1,
  windowWebsocket2,
} from './lib/WebSocketClient';

// 웹소켓 채팅 페이지 구현

document.addEventListener('DOMContentLoaded', () => {
  // HTML 요소 생성 및 스타일 적용
  const app = document.createElement('div');
  app.className = 'chat-app';

  // 통신 상태 표시 영역
  const statusDisplay = document.createElement('div');
  statusDisplay.className = 'status-display';
  statusDisplay.textContent = '연결 상태: 연결되지 않음';
  statusDisplay.style.color = 'gray';

  // 채팅 메시지 표시 영역
  const chatMessages = document.createElement('div');
  chatMessages.className = 'chat-messages';

  // 연결 제어 버튼 영역
  const connectionControls = document.createElement('div');
  connectionControls.className = 'connection-controls';

  // 연결하기 버튼
  const connectButton = document.createElement('button');
  connectButton.className = 'control-button connect-button';
  connectButton.textContent = '연결하기';

  // 연결 끊기 버튼
  const disconnectButton = document.createElement('button');
  disconnectButton.className = 'control-button disconnect-button';
  disconnectButton.textContent = '연결 끊기';
  disconnectButton.disabled = true;

  // 연결 제어 버튼들을 영역에 추가
  connectionControls.appendChild(connectButton);
  connectionControls.appendChild(disconnectButton);

  // 메시지 입력 폼
  const form = document.createElement('form');
  form.className = 'message-form';

  // 메시지 입력 textarea
  const textarea = document.createElement('textarea');
  textarea.className = 'message-input';
  textarea.placeholder = '메시지를 입력하세요...';
  textarea.disabled = true;

  // 전송 버튼
  const sendButton = document.createElement('button');
  sendButton.className = 'send-button';
  sendButton.textContent = '전송';
  sendButton.type = 'submit';
  sendButton.disabled = true;

  // 요소들을 DOM에 추가
  form.appendChild(textarea);
  form.appendChild(sendButton);
  app.appendChild(statusDisplay);
  app.appendChild(connectionControls);
  app.appendChild(chatMessages);
  app.appendChild(form);
  document.body.appendChild(app);

  // 스타일 추가
  applyStyles();

  // 웹소켓 클라이언트 관리
  let client: WebSocketClient | null = null;

  // 연결 버튼 클릭 이벤트
  connectButton.addEventListener('click', () => {
    initializeWebSocket();
    connectButton.disabled = true;
    disconnectButton.disabled = false;
  });

  // 연결 끊기 버튼 클릭 이벤트
  disconnectButton.addEventListener('click', () => {
    if (client) {
      client.disconnect();
      statusDisplay.textContent = '연결 상태: 사용자에 의해 연결 끊김';
      statusDisplay.style.color = 'gray';
      addSystemMessage('사용자가 연결을 종료했습니다.');

      connectButton.disabled = false;
      disconnectButton.disabled = true;
      textarea.disabled = true;
      sendButton.disabled = true;
      client = null;
    }
  });

  // 웹소켓 초기화 함수
  function initializeWebSocket() {
    statusDisplay.textContent = '연결 상태: 연결 시도 중...';
    statusDisplay.style.color = 'blue';
    addSystemMessage('서버에 연결 시도 중...');

    try {
      // client = windowWebsocket1;
      client = windowWebsocket2;

      client.onConnect(() => {
        console.log('연결 성공1');
        statusDisplay.textContent = '연결 상태: 연결됨';
        statusDisplay.style.color = 'green';
        addSystemMessage('서버에 연결되었습니다.');

        // 입력창과 전송 버튼 활성화
        textarea.disabled = false;
        sendButton.disabled = false;
      });

      client.onMessage((message) => {
        addMessage('받음', message);
      });

      client.onError((error) => {
        statusDisplay.textContent = '연결 상태: 오류 발생';
        statusDisplay.style.color = 'red';
        addSystemMessage('연결 오류가 발생했습니다.');
        console.error('WebSocket error:', error);

        connectButton.disabled = false;
        disconnectButton.disabled = true;
        textarea.disabled = true;
        sendButton.disabled = true;
        client = null;
      });

      client.onClose(() => {
        statusDisplay.textContent = '연결 상태: 연결 끊김';
        statusDisplay.style.color = 'red';
        addSystemMessage('서버와의 연결이 끊겼습니다.');

        connectButton.disabled = false;
        disconnectButton.disabled = true;
        textarea.disabled = true;
        sendButton.disabled = true;
        client = null;
      });

      client.connect().then(() => {
        console.log('연결 성공');
      });
    } catch (error) {
      statusDisplay.textContent = '연결 상태: 연결 실패';
      statusDisplay.style.color = 'red';
      addSystemMessage('서버 연결에 실패했습니다.');
      console.error('WebSocket connection error:', error);

      connectButton.disabled = false;
      disconnectButton.disabled = true;
      client = null;
    }
  }

  // 폼 제출 이벤트 처리
  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const message = textarea.value.trim();
    if (message && client) {
      client.send(message);
      addMessage('보냄', message);
      textarea.value = '';
    } else if (!client) {
      addSystemMessage(
        '서버에 연결되어 있지 않습니다. 메시지를 보낼 수 없습니다.'
      );
    }
  });

  // 메시지 추가 함수
  function addMessage(type: string, content: string) {
    const messageElement = document.createElement('div');
    messageElement.className = `message ${type.toLowerCase()}-message`;

    const typeSpan = document.createElement('span');
    typeSpan.className = 'message-type';
    typeSpan.textContent = `[${type}]`;

    const contentSpan = document.createElement('span');
    contentSpan.className = 'message-content';
    contentSpan.textContent = content;

    messageElement.appendChild(typeSpan);
    messageElement.appendChild(contentSpan);
    chatMessages.appendChild(messageElement);

    // 스크롤을 최하단으로 이동
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  // 시스템 메시지 추가 함수
  function addSystemMessage(content: string) {
    const messageElement = document.createElement('div');
    messageElement.className = 'system-message';
    messageElement.textContent = content;
    chatMessages.appendChild(messageElement);

    // 스크롤을 최하단으로 이동
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  // 스타일 적용 함수
  function applyStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .chat-app {
        max-width: 600px;
        margin: 0 auto;
        padding: 20px;
        font-family: Arial, sans-serif;
        border: 1px solid #ccc;
        border-radius: 8px;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
      }
      
      .status-display {
        padding: 10px;
        margin-bottom: 10px;
        background-color: #f8f8f8;
        border-radius: 4px;
        text-align: center;
        font-weight: bold;
      }
      
      .connection-controls {
        display: flex;
        justify-content: center;
        gap: 10px;
        margin-bottom: 15px;
      }
      
      .control-button {
        padding: 8px 15px;
        border-radius: 4px;
        border: none;
        font-weight: bold;
        cursor: pointer;
      }
      
      .connect-button {
        background-color: #4caf50;
        color: white;
      }
      
      .connect-button:hover:not(:disabled) {
        background-color: #3d8b40;
      }
      
      .disconnect-button {
        background-color: #f44336;
        color: white;
      }
      
      .disconnect-button:hover:not(:disabled) {
        background-color: #d32f2f;
      }
      
      .control-button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      
      .chat-messages {
        height: 300px;
        overflow-y: auto;
        border: 1px solid #ddd;
        border-radius: 4px;
        padding: 10px;
        margin-bottom: 10px;
      }
      
      .message {
        margin: 5px 0;
        padding: 8px;
        border-radius: 4px;
      }
      
      .message-type {
        font-weight: bold;
        margin-right: 8px;
      }
      
      .보냄-message {
        background-color: #e6f7ff;
        text-align: right;
      }
      
      .받음-message {
        background-color: #f1f1f1;
      }
      
      .system-message {
        font-style: italic;
        color: #888;
        text-align: center;
        margin: 5px 0;
      }
      
      .message-form {
        display: flex;
        gap: 10px;
      }
      
      .message-input {
        flex: 1;
        padding: 10px;
        border: 1px solid #ddd;
        border-radius: 4px;
        resize: none;
        height: 60px;
      }
      
      .send-button {
        padding: 10px 20px;
        background-color: #2196f3;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
      }
      
      .send-button:hover:not(:disabled) {
        background-color: #0b7dda;
      }
      
      .send-button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    `;
    document.head.appendChild(style);
  }
});
