import { describe, expect, it } from 'vitest';
import { sanitizePlainText } from '../../../src/domain/sanitizer/field-sanitizer';

describe('sanitizePlainText', () => {
  it('removes nested tags that reappear after a single pass', () => {
    const result = sanitizePlainText('<scr<script>ipt>alert(1)');
    expect(result).not.toMatch(/<script/i);
    expect(result).not.toMatch(/[<>]/);
  });

  it('removes tags hidden inside a tag-like wrapper', () => {
    const result = sanitizePlainText('<<script>script>alert(1)');
    expect(result).not.toMatch(/<script/i);
  });

  it('removes dangerous substrings that reappear after a single pass', () => {
    expect(sanitizePlainText('javajavascript:script:alert(1)')).not.toMatch(/javascript:/i);
  });

  it('keeps ordinary text intact', () => {
    expect(sanitizePlainText('  <b>焼肉</b> &amp; 酒場  ')).toBe('焼肉 & 酒場');
  });
});
