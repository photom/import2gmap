import type { ExtractedShop } from '../models/extracted-shop';

const DOCUMENT_DESCRIPTION = 'Tabelog Bookmarks Exported via Chrome Extension';

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export class KmlBuilder {
  build(mapName: string, shops: readonly ExtractedShop[]): string {
    const placemarks = shops.map((shop) => this.buildPlacemark(shop)).join('\n');

    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<kml xmlns="http://www.opengis.net/kml/2.2">',
      '  <Document>',
      `    <name>${escapeXml(mapName)}</name>`,
      `    <description>${escapeXml(DOCUMENT_DESCRIPTION)}</description>`,
      placemarks,
      '  </Document>',
      '</kml>',
    ]
      .filter((line) => line.length > 0)
      .join('\n');
  }

  private buildPlacemark(shop: ExtractedShop): string {
    return [
      '    <Placemark>',
      `      <name>${escapeXml(shop.name)}</name>`,
      `      <description><![CDATA[${shop.description}]]></description>`,
      `      <address>${escapeXml(shop.address)}</address>`,
      '    </Placemark>',
    ].join('\n');
  }
}
