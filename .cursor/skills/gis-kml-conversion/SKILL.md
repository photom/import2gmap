---
name: gis-kml-conversion
description: Specification and algorithms for converting extracted shop data into valid KML (Keyhole Markup Language) XML for Google My Maps import. Fields: name, address, description (URL first line, optional short text after).
---

# GIS & KML Conversion Skill (`gis-kml-conversion`)

This skill defines the data formatting rules and XML generation logic for converting shop records into **KML (Keyhole Markup Language)** for seamless Google Maps / My Maps integration.

Product fields: `name` → `<name>`, `address` → `<address>`, `description` → `<description>`.

`description` contract (from extraction):

1. First line: sanitized Tabelog shop URL (required).
2. Optional following line(s): sanitized short description (e.g. area/category). No HTML markup.

## KML File Structure
A valid KML document containing shop placemarks must conform to the OGC KML 2.2 standard:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>食べログお気に入りリスト</name>
    <description>Tabelog Bookmarks Exported via Chrome Extension</description>
    <Placemark>
      <name>{shop-name}</name>
      <description><![CDATA[
{tabelog-shop-url}
{optional-short-description}
      ]]></description>
      <address>{street-address}</address>
    </Placemark>
  </Document>
</kml>
```

Do not embed rating, genre-as-address, phone, or account/PII fields. Sanitize all text before emission; still XML-escape or use CDATA only after sanitization (see extraction spec Section 6).

## Geo / Address Resolution
1. **Address-based Placement**:
   - Google Maps & My Maps automatically geocode `<address>` tags in KML files upon import.
2. **Coordinate-based Placement**:
   - If latitude and longitude are present, include `<Point><coordinates>lng,lat,0</coordinates></Point>`.

## In-Memory Transfer (Chrome Extension)
- Build the KML string in memory; do not write credentials or profile data into the document.
- Prefer a `Blob` / in-memory file handle for My Maps Web UI import automation (`google-my-maps-web-import`).
- Optional user download may use `chrome.downloads` or an object URL; keep the payload limited to name, address, and description (URL-first).
