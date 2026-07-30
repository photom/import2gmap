import { ExtractionError } from '../errors/extraction-error';
import { MAX_LENGTHS, sanitizePlainText, truncate } from '../sanitizer/field-sanitizer';
import { sanitizeShopUrl } from '../sanitizer/url-sanitizer';

const PHONE_LINE_PATTERN = /^[0-9０-９+\-−ー()（）\s]+$/;

function normalizeForComparison(text: string): string {
  return text.normalize('NFKC').replace(/\s+/g, ' ').trim();
}

function isAllowlistedShopUrl(line: string): boolean {
  try {
    sanitizeShopUrl(line);
    return true;
  } catch {
    return false;
  }
}

function isPhoneLine(line: string): boolean {
  return PHONE_LINE_PATTERN.test(line) && /\d/.test(line);
}

export function parseAddress(rawTextareaValue: string, sanitizedName: string): string {
  const lines = rawTextareaValue
    .split(/\r\n|\r|\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const addressLines = lines.filter((line) => {
    if (isAllowlistedShopUrl(line)) return false;
    if (isPhoneLine(line)) return false;
    if (normalizeForComparison(line) === normalizeForComparison(sanitizedName)) return false;
    return true;
  });

  const address = truncate(sanitizePlainText(addressLines.join(' ')), MAX_LENGTHS.address);
  if (!address) {
    throw new ExtractionError('AddressMissing');
  }
  return address;
}
