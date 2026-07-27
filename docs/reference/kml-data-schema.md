# KML Data Schema

Normative mapping from domain extract results to OGC KML 2.2 for in-memory My Maps import.

Related: [extraction spec](tabelog-pc-saved-list-extraction-spec.md), [gis-kml-conversion skill](../../.cursor/skills/gis-kml-conversion/SKILL.md), [ADR-0005](../explanation/adr/0005-extract-collections-for-future-pin-styling.md) (collections / future styles).

---

## 1. Scope (v1)

| In KML | Not in KML (v1) |
| :--- | :--- |
| Document name (map title from UI) | `<Style>` / `<StyleMap>` / icon href per collection |
| One `<Placemark>` per shop | Phone numbers |
| `<name>`, `<address>`, `<description>` | Ratings, budgets, holidays |
| Geocode via `<address>` (no coordinates required) | Collection ids/names as ExtendedData (deferred) |
| | User download file UX (memory Blob only by default) |

**Collections** remain on the domain / session model for a later pin-color design. v1 KML **must not** emit style URLs, color tags, or folder-per-collection splits unless a new ADR says so.

---

## 2. Document root

```xml
<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>{mapName}</name>
    <description>Tabelog Bookmarks Exported via Chrome Extension</description>
    <!-- Placemark* -->
  </Document>
</kml>
```

| Field | Source | Rules |
| :--- | :--- | :--- |
| `{mapName}` | Session / confirm UI (`mapName`) | Sanitized plain text; XML-escaped if not using CDATA for this element |
| Document `<description>` | Fixed product string above | No user/PII content |

Character encoding: UTF-8.

---

## 3. Placemark contract

One placemark per `StoredShop` / `ExtractedShop`, document order = extract order after dedupe.

| KML element | Domain field | Rules |
| :--- | :--- | :--- |
| `<name>` | `name` | Required; sanitized; XML-escape (or equivalent safe emission) |
| `<address>` | `address` | Required; street address only; sanitized; no area/category line |
| `<description>` | `description` | See §4 |
| `<Point>` | — | **Omit** in v1 unless coordinates are explicitly added later |

Do not add `<ExtendedData>` for collections in v1.

---

## 4. Description contract

`description` is assembled at extract time and reused as-is (already sanitized):

```text
{tabelogShopUrl}
{optionalAreaCategory}
```

| Line | Content | Required |
| :--- | :--- | :--- |
| 1 | Allowlisted `https` Tabelog shop URL (same as domain `url`) | Yes |
| 2+ | Optional short text from area/category (`areaCategory`); plain text only | No |

Rules:

- First line **must** be the shop URL (machine-stable position).
- No HTML / Markdown in description body.
- Do **not** append collection names, phones, or memos.
- Prefer CDATA for `<description>` **after** sanitization; if not using CDATA, XML-escape `& < > " '`.

Example shape (placeholders only):

```xml
<Placemark>
  <name>Example Shop</name>
  <description><![CDATA[
https://tabelog.com/example/path/12345678/
Area / Category text
  ]]></description>
  <address>Example Prefecture Example City 1-2-3</address>
</Placemark>
```

---

## 5. Generation algorithm

1. Input: `mapName` + `shops[]` (session extract result).
2. Reject generation if any shop missing `name` / `url` / `address` / `description` first line.
3. Emit XML header + `<Document>` with escaped `mapName`.
4. For each shop, emit placemark (§3–4).
5. Return string or `Blob` (`application/vnd.google-earth.kml+xml` or `application/xml`); keep in memory for My Maps prelude.

Idempotent: same inputs → same KML (stable ordering).

---

## 6. Future (out of scope)

- Map `collectionsCatalog` → KML styles / folders / pin colors (ADR-0005 follow-up).
- Multi-collection conflict policy when a shop has multiple labels.
- Coordinate `<Point>` if a future geocoder is added.

---

## 7. Test expectations

- URL is line 1 of every description.
- Collection-only shops still get no style nodes.
- Ampersands in names/addresses are safely escaped.
- Phone never appears even if present in upstream fixtures’ copy helper.
