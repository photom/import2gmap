import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const FIXTURES_ROOT = resolve(__dirname, '../fixtures/tabelog');

export function loadFixtureDocument(fileName: string): Document {
  const path = resolve(FIXTURES_ROOT, fileName);
  if (!path.startsWith(FIXTURES_ROOT)) {
    throw new Error(`Fixture path escapes test/fixtures/tabelog: ${fileName}`);
  }
  const html = readFileSync(path, 'utf-8');
  return new DOMParser().parseFromString(html, 'text/html');
}
