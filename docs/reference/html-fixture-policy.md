# HTML Fixture Policy (Development & Tests)

Rules for HTML fixtures used to unit-test Tabelog PC saved-list parsing and related DOM helpers.

Related: [extraction spec](tabelog-pc-saved-list-extraction-spec.md), [security/privacy](../explanation/security-privacy-model.md), [tdd-webextension](../../.cursor/skills/tdd-webextension/SKILL.md).

---

## 1. Purpose

- Provide **deterministic, sanitized** DOM slices for Canon TDD (parsers, label join, pager chrome).
- Avoid committing real account identifiers, real personal memos, or live session tokens.

---

## 2. Locations

| Path | Tracked in git? | Role |
| :--- | :--- | :--- |
| `test/fixtures/tabelog/` | **Yes** | Canonical sanitized fixtures for unit tests |
| `test/fixtures/tabelog/pages/` | Yes | Full or multi-item list fragments |
| `test/fixtures/tabelog/fragments/` | Yes | Single item, pager-only, bookmarks-json-only, etc. |
| `sample/` | **No** (gitignored) | Local scratch captures for humans; **not** imported by tests |

Tests must load fixtures only from `test/fixtures/**`. Never `require` / `readFile` from `sample/` in CI or unit tests.

Suggested naming:

```text
test/fixtures/tabelog/
  pages/
    saved-list-one-page.html
    saved-list-with-pager.html
  fragments/
    item-minimal.html
    item-with-labels-data.html
    bookmarks-data-valid.json.html   # tiny doc wrapping data-bookmarks
    bookmarks-data-invalid.html
    pager-next-only.html
```

---

## 3. Required sanitization before commit

Replace or remove:

| Content | Replacement |
| :--- | :--- |
| `/rvwr/{realId}/` path segments | `/rvwr/000000000/` or `REDACTED_RVWR` |
| Real shop names / addresses / phones | Fictional placeholders (`Example Shop`, `東京都テスト区1-2-3`, omit or fake phone lines) |
| Real Tabelog shop URLs | `https://tabelog.com/tokyo/A0000/A000000/10000000/` style fakes that still match allowlist shape |
| Collection titles | Neutral labels (`Collection A`) |
| `data-bookmarks` / `#js-collection` JSON | Hand-built minimal JSON with fake ids; strip `bookmark_comment*` or set to `""` |
| Auth tokens, CSRF, cookie strings | Remove nodes/attributes entirely |
| Personal images / identifiable alt text | Placeholder or remove |
| Inline scripts that call home | Remove or stub empty |

Keep **class names, structure, and attribute names** that production selectors depend on (`js-bookmark`, `simple-rvw__rst-name-target`, `rst-info-copy__item-txt`, `c-pagination__arrow--next`, `data-rst-id`, etc.).

---

## 4. Prohibitions

- Do **not** commit raw browser “Save As” dumps of a logged-in account page into `test/fixtures/`.
- Do **not** commit real reviewer ids, emails, or live `authenticity-token` values.
- Do **not** use production fixtures that include non-empty bookmark memos.
- Do **not** document real shop payloads from personal lists in specs or ADRs (selectors/structure only).
- Do **not** point CI at `sample/pc.html` even if present locally.

---

## 5. Authoring workflow

1. Optionally capture locally under `sample/` (ignored).
2. Copy structure into `test/fixtures/tabelog/...`.
3. Redact per §3; keep selector surface intact.
4. Add/adjust a unit test that asserts behavior on that fixture.
5. PR review: spot-check for `/rvwr/` digits, phone-like patterns, comment fields.

---

## 6. Minimal item shape (for authors)

A usable item fragment should include:

- `div.js-bookmark` with `data-rst-id`
- `a.simple-rvw__rst-name-target` (name + href)
- `textarea.rst-info-copy__item-txt` with four lines: name, fake-or-empty phone line, address, url
- Optional `p.simple-rvw__area-catg`
- For collections: page-level `#js-bookmarks-data[data-bookmarks]` whose keys match `data-rst-id`, with `labels: [{ id, title }]` only

---

## 7. Test expectations

- Fixture loader rejects paths outside `test/fixtures/` (optional guard in test helper).
- At least one fixture covers: zero labels, multiple labels, invalid bookmarks JSON → `BookmarksDataInvalid`, pager next present/absent, entity-encoded name.
