const MULTI_LEVEL = '#';
const SINGLE_LEVEL = '+';

/**
 * MQTT 3.1.1 4.7 규칙에 따라 구독 필터가 수신 topic과 맞는지 판단한다.
 * STOMP와 달리 MQTT는 모든 메시지가 하나의 `message` 이벤트로 들어오므로,
 * 어댑터가 구독별 콜백을 고르려면 이 매칭이 필요하다.
 */
export function isTopicMatch(filter: string, topic: string): boolean {
  if (filter === '') {
    return false;
  }

  const filterLevels = filter.split('/');

  if (!isValidFilter(filterLevels)) {
    return false;
  }

  // 4.7.2: 와일드카드로 시작하는 필터는 $로 시작하는 topic을 잡지 않는다.
  if (startsWithWildcard(filterLevels) && topic.startsWith('$')) {
    return false;
  }

  const topicLevels = topic.split('/');

  for (let index = 0; index < filterLevels.length; index += 1) {
    const level = filterLevels[index];

    // 4.7.1.2: '#'은 남은 레벨 전체와 부모 레벨 자신까지 포함한다.
    if (level === MULTI_LEVEL) {
      return index <= topicLevels.length;
    }

    if (index >= topicLevels.length) {
      return false;
    }

    if (level !== SINGLE_LEVEL && level !== topicLevels[index]) {
      return false;
    }
  }

  return filterLevels.length === topicLevels.length;
}

/**
 * 와일드카드는 레벨 하나를 온전히 차지해야 하고, '#'은 마지막 레벨에만 올 수 있다.
 */
function isValidFilter(levels: string[]): boolean {
  return levels.every((level, index) => {
    if (level.includes(MULTI_LEVEL)) {
      return level === MULTI_LEVEL && index === levels.length - 1;
    }

    return !level.includes(SINGLE_LEVEL) || level === SINGLE_LEVEL;
  });
}

function startsWithWildcard(levels: string[]): boolean {
  return levels[0] === MULTI_LEVEL || levels[0] === SINGLE_LEVEL;
}
