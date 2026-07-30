import { describe, expect, it } from 'vitest';
import { KmlBuilder } from '../../../src/domain/kml/kml-builder';
import type { ExtractedShop } from '../../../src/domain/models/extracted-shop';

function parseXml(xml: string): Document {
  return new DOMParser().parseFromString(xml, 'application/xml');
}

const shop1: ExtractedShop = {
  name: 'テスト店舗1',
  url: 'https://tabelog.com/tokyo/A1301/A130101/10000001/',
  address: '東京都中央区銀座1-2-3',
  description: 'https://tabelog.com/tokyo/A1301/A130101/10000001/\n銀座 / 居酒屋',
  collections: [{ id: '101', name: '行きたいお店' }],
};

const shop2: ExtractedShop = {
  name: 'テスト&店舗2',
  url: 'https://tabelog.com/tokyo/A1302/A130201/10000002/',
  address: '東京都千代田区丸の内1-1-1',
  description: 'https://tabelog.com/tokyo/A1302/A130201/10000002/',
  collections: [],
};

describe('KmlBuilder#build', () => {
  it('generates a UTF-8 OGC KML 2.2 document header with an XML-escaped map title', () => {
    const builder = new KmlBuilder();

    const kml = builder.build('2024年の保存リスト & <特集>', []);

    expect(kml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(kml).toContain('<kml xmlns="http://www.opengis.net/kml/2.2">');

    const doc = parseXml(kml);
    expect(doc.querySelector('kml > Document > name')?.textContent).toBe(
      '2024年の保存リスト & <特集>',
    );
  });

  it('sets the fixed product description under Document', () => {
    const builder = new KmlBuilder();

    const kml = builder.build('マイマップ', []);
    const doc = parseXml(kml);

    expect(doc.querySelector('kml > Document > description')?.textContent).toBe(
      'Tabelog Bookmarks Exported via Chrome Extension',
    );
  });

  it('emits one Placemark per extracted shop in document order', () => {
    const builder = new KmlBuilder();

    const kml = builder.build('マイマップ', [shop1, shop2]);
    const doc = parseXml(kml);
    const placemarks = doc.querySelectorAll('Placemark');

    expect(placemarks).toHaveLength(2);
    expect(placemarks[0].querySelector('name')?.textContent).toBe('テスト店舗1');
    expect(placemarks[1].querySelector('name')?.textContent).toBe('テスト&店舗2');
  });

  it('places sanitized shop name in name and sanitized address in address', () => {
    const builder = new KmlBuilder();

    const kml = builder.build('マイマップ', [shop1]);
    const doc = parseXml(kml);
    const placemark = doc.querySelector('Placemark')!;

    expect(placemark.querySelector('name')?.textContent).toBe(shop1.name);
    expect(placemark.querySelector('address')?.textContent).toBe(shop1.address);
  });

  it('formats description inside CDATA with the shop URL on line 1 and areaCategory on line 2', () => {
    const builder = new KmlBuilder();

    const kml = builder.build('マイマップ', [shop1]);
    expect(kml).toContain('<![CDATA[https://tabelog.com/tokyo/A1301/A130101/10000001/\n銀座 / 居酒屋]]>');

    const doc = parseXml(kml);
    const description = doc.querySelector('Placemark description')?.textContent;
    expect(description).toBe(shop1.description);
  });

  it('emits no phone numbers, bookmark memos, or Style tags', () => {
    const builder = new KmlBuilder();

    const kml = builder.build('マイマップ', [shop1, shop2]);

    expect(kml).not.toContain('<Style');
    expect(kml).not.toContain('03-1234-5678');
  });
});
