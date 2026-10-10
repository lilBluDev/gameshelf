import { describe, it, expect } from 'vitest';
import { formatPlaytime } from './playtime';

describe('formatPlaytime', () => {
  it('handles zero and negative seconds', () => {
    expect(formatPlaytime(0)).toBe('0m');
    expect(formatPlaytime(-10)).toBe('0m');
  });

  it('handles under a minute duration', () => {
    expect(formatPlaytime(1)).toBe('<1m');
    expect(formatPlaytime(30)).toBe('<1m');
    expect(formatPlaytime(59)).toBe('<1m');
  });

  it('handles minutes without hours', () => {
    expect(formatPlaytime(60)).toBe('1m');
    expect(formatPlaytime(120)).toBe('2m');
    expect(formatPlaytime(2700)).toBe('45m');
    expect(formatPlaytime(3599)).toBe('59m');
  });

  it('handles exact hours', () => {
    expect(formatPlaytime(3600)).toBe('1h');
    expect(formatPlaytime(7200)).toBe('2h');
    expect(formatPlaytime(432000)).toBe('120h');
  });

  it('handles hours and minutes combined', () => {
    expect(formatPlaytime(3660)).toBe('1h 1m');
    expect(formatPlaytime(4500)).toBe('1h 15m');
    expect(formatPlaytime(5400)).toBe('1h 30m');
    expect(formatPlaytime(86400)).toBe('24h');
  });
});
