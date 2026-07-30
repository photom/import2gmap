export const MAX_LENGTHS = {
  name: 200,
  address: 400,
  areaCategory: 300,
  collectionName: 100,
  collectionId: 32,
  description: 800,
} as const;

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

const DANGEROUS_PATTERNS: RegExp[] = [
  /javascript:/gi,
  /vbscript:/gi,
  /data:text\/html/gi,
  /<script/gi,
  /<\/script/gi,
  /<style/gi,
  /<\/style/gi,
  /<iframe/gi,
  /<object/gi,
  /<embed/gi,
  /<link/gi,
  /<meta/gi,
  /on\w+\s*=/gi,
  /expression\(/gi,
  /-moz-binding/gi,
  /behavior:/gi,
  /url\(javascript/gi,
];

function stripHtmlTags(text: string): string {
  return text.replace(/<[^>]*>/g, '');
}

function decodeHtmlEntitiesOnce(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity: string) => {
    if (entity[0] === '#') {
      const isHex = entity[1] === 'x' || entity[1] === 'X';
      const codePoint = isHex ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isNaN(codePoint) ? match : String.fromCodePoint(codePoint);
    }
    return NAMED_ENTITIES[entity] ?? match;
  });
}

function stripDangerousSubstrings(text: string): string {
  return DANGEROUS_PATTERNS.reduce((acc, pattern) => acc.replace(pattern, ''), text);
}

function stripControlChars(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
}

export function sanitizePlainText(raw: string, maxLength: number): string {
  let text = raw.normalize('NFKC');
  text = stripHtmlTags(text);
  text = decodeHtmlEntitiesOnce(text);
  if (/[<>]/.test(text)) {
    text = stripHtmlTags(text);
  }
  text = stripDangerousSubstrings(text);
  text = stripControlChars(text);
  text = text.replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}
