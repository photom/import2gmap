---
name: gis-kml-conversion
description: Specification and algorithms for converting extracted shop data into valid KML (Keyhole Markup Language) XML files for Google Maps import. Fields: name, address, Tabelog URL in description.
---

# GIS & KML Conversion Skill (`gis-kml-conversion`)

This skill defines the data formatting rules and XML generation logic for converting shop records into **KML (Keyhole Markup Language)** for seamless Google Maps / My Maps integration.

Product fields only: `name` → `<name>`, `address` → `<address>`, `url` → `<description>` (URL text).

## KML File Structure
A valid KML document containing shop placemarks must conform to the OGC KML 2.2 standard:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>食べログお気に入りリスト</name>
    <description>Tabelog Bookmarks Exported via Android App</description>
    <Placemark>
      <name>{shop-name}</name>
      <description><![CDATA[
        {tabelog-shop-url}
      ]]></description>
      <address>{street-address}</address>
    </Placemark>
  </Document>
</kml>
```

Do not embed rating, genre, phone, or account/PII fields.

## Geo / Address Resolution
1. **Address-based Placement**:
   - Google Maps & My Maps automatically geocode `<address>` tags in KML files upon import.
2. **Coordinate-based Placement**:
   - If latitude and longitude are present, include `<Point><coordinates>lng,lat,0</coordinates></Point>`.

## Android File Export & Intent
```kotlin
fun shareKmlFile(context: Context, kmlFile: File) {
    val contentUri: Uri = FileProvider.getUriForFile(
        context,
        "${context.packageName}.fileprovider",
        kmlFile
    )
    val intent = Intent(Intent.ACTION_VIEW).apply {
        setDataAndType(contentUri, "application/vnd.google-earth.kml+xml")
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    context.startActivity(Intent.createChooser(intent, "Google Maps で開く"))
}
```
