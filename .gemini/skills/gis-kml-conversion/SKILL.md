---
name: gis-kml-conversion
description: Specification and algorithms for converting extracted shop data into valid KML (Keyhole Markup Language) XML files for Google Maps import.
---

# GIS & KML Conversion Skill (`gis-kml-conversion`)

This skill defines the data formatting rules and XML generation logic for converting shop records into **KML (Keyhole Markup Language)** for seamless Google Maps / My Maps integration.

## KML File Structure
A valid KML document containing shop placemarks must conform to the OGC KML 2.2 standard:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>食べログお気に入りリスト</name>
    <description>Tabelog Bookmarks Exported via Android App</description>
    
    <!-- Placemark Example -->
    <Placemark>
      <name>店舗名（例：寿司 さくら）</name>
      <description><![CDATA[
        <p><b>評価:</b> 3.85</p>
        <p><b>住所:</b> 東京都港区六本木1-2-3</p>
        <p><a href="https://tabelog.com/tokyo/A1307/A130701/13000000/">食べログで見る</a></p>
      ]]></description>
      <address>東京都港区六本木1-2-3</address>
      <!-- ExtendedData for My Maps column mapping -->
      <ExtendedData>
        <Data name="Rating"><value>3.85</value></Data>
        <Data name="TabelogUrl"><value>https://tabelog.com/...</value></Data>
      </ExtendedData>
      <!-- Optional: Coordinates if geocoded -->
      <!-- <Point><coordinates>139.7314,35.6628,0</coordinates></Point> -->
    </Placemark>
  </Document>
</kml>
```

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
