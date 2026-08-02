import { describe, expect, it } from 'vitest';
import { buildKmlFile } from '../../../src/domain/my-maps/build-kml-file';

describe('buildKmlFile', () => {
  it('builds a File whose name and content round-trip the given KML string', async () => {
    const kml = '<?xml version="1.0"?><kml><Document></Document></kml>';

    const file = buildKmlFile(kml, '食べログ保存リスト 2026-08-02.kml');

    expect(file.name).toBe('食べログ保存リスト 2026-08-02.kml');
    expect(await file.text()).toBe(kml);
  });

  it('uses a KML-appropriate MIME type', () => {
    const file = buildKmlFile('<kml></kml>', 'a.kml');

    expect(file.type).toBe('application/vnd.google-earth.kml+xml');
  });
});
