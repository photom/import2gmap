import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const FIXTURES_ROOT = resolve(__dirname, '../fixtures/tabelog');
const GOOGLE_MAPS_FIXTURES_ROOT = resolve(__dirname, '../fixtures/google-maps');

function loadDocumentFrom(root: string, fileName: string): Document {
  const path = resolve(root, fileName);
  if (!path.startsWith(root)) {
    throw new Error(`Fixture path escapes ${root}: ${fileName}`);
  }
  const html = readFileSync(path, 'utf-8');
  return new DOMParser().parseFromString(html, 'text/html');
}

export function loadFixtureDocument(fileName: string): Document {
  return loadDocumentFrom(FIXTURES_ROOT, fileName);
}

export function loadGoogleMapsFixtureDocument(fileName: string): Document {
  return loadDocumentFrom(GOOGLE_MAPS_FIXTURES_ROOT, fileName);
}
