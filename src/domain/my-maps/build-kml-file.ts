const KML_MIME_TYPE = 'application/vnd.google-earth.kml+xml';

export function buildKmlFile(kml: string, fileName: string): File {
  return new File([kml], fileName, { type: KML_MIME_TYPE });
}
