import { describe, expect, it } from 'vitest';

import { isTopicMatch } from './topicMatch';

describe('isTopicMatch', () => {
  it('matches an exact topic and rejects a different one', () => {
    expect(isTopicMatch('sensor/a/temp', 'sensor/a/temp')).toBe(true);
    expect(isTopicMatch('sensor/a/temp', 'sensor/b/temp')).toBe(false);
    expect(isTopicMatch('sensor/a', 'sensor/a/temp')).toBe(false);
    expect(isTopicMatch('sensor/a/temp', 'sensor/a')).toBe(false);
  });

  it('matches exactly one level with +', () => {
    expect(isTopicMatch('sensor/+/temp', 'sensor/a/temp')).toBe(true);
    expect(isTopicMatch('sensor/+/temp', 'sensor/a/b/temp')).toBe(false);
    expect(isTopicMatch('sensor/+', 'sensor/a')).toBe(true);
    expect(isTopicMatch('sensor/+', 'sensor/a/b')).toBe(false);
    expect(isTopicMatch('+/a', 'sensor/a')).toBe(true);
  });

  it('treats an empty level as a valid single level for +', () => {
    expect(isTopicMatch('sensor/+/temp', 'sensor//temp')).toBe(true);
    expect(isTopicMatch('+', '')).toBe(true);
  });

  it('matches the remaining levels with #', () => {
    expect(isTopicMatch('sensor/#', 'sensor/a')).toBe(true);
    expect(isTopicMatch('sensor/#', 'sensor/a/b/c')).toBe(true);
    expect(isTopicMatch('sensor/#', 'sensorx/a')).toBe(false);
    expect(isTopicMatch('#', 'sensor/a/b')).toBe(true);
  });

  it('matches the parent level itself with #', () => {
    // MQTT 3.1.1 4.7.1.2: "sport/#" also matches "sport"
    expect(isTopicMatch('sensor/#', 'sensor')).toBe(true);
    expect(isTopicMatch('sensor/#', 'sensor/')).toBe(true);
  });

  it('does not match a $-prefixed topic with a leading wildcard', () => {
    // MQTT 3.1.1 4.7.2
    expect(isTopicMatch('#', '$SYS/broker/uptime')).toBe(false);
    expect(isTopicMatch('+/broker/uptime', '$SYS/broker/uptime')).toBe(false);
    expect(isTopicMatch('+', '$SYS')).toBe(false);
  });

  it('matches a $-prefixed topic when the filter names it explicitly', () => {
    expect(isTopicMatch('$SYS/#', '$SYS/broker/uptime')).toBe(true);
    expect(isTopicMatch('$SYS/+/uptime', '$SYS/broker/uptime')).toBe(true);
    expect(isTopicMatch('$SYS/broker', '$SYS/broker')).toBe(true);
  });

  it('rejects a filter whose wildcard does not occupy a whole level', () => {
    expect(isTopicMatch('sensor/te+p', 'sensor/temp')).toBe(false);
    expect(isTopicMatch('sensor/#/temp', 'sensor/a/temp')).toBe(false);
    expect(isTopicMatch('sensor#', 'sensor')).toBe(false);
  });

  it('rejects an empty filter', () => {
    expect(isTopicMatch('', 'sensor/a')).toBe(false);
  });
});
