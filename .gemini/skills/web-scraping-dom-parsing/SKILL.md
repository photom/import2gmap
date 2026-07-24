---
name: web-scraping-dom-parsing
description: Guidelines for safely injecting JavaScript into Android WebViews to parse and extract structured shop data from HTML/DOM.
---

# Web Scraping & DOM Parsing Skill (`web-scraping-dom-parsing`)

This skill covers techniques for extracting structured data from web pages loaded within an Android `WebView` using JavaScript Injection and DOM parsing.

## Extraction Flow
1. **Navigation Hook**:
   - Detect when `WebView` navigates to Tabelog's bookmark page (`https://tabelog.com/user/bookmark/` or user's specific bookmark URL).
2. **JavaScript Injection**:
   - Use `webView.evaluateJavascript(jsString) { result -> ... }` to execute custom DOM extraction scripts.
3. **Data Payload**:
   - Extract the following fields per shop:
     - `shopName` (Text)
     - `address` (Text)
     - `rating` (Float/String)
     - `genre` (Text)
     - `tabelogUrl` (URL String)
     - `latitude` / `longitude` (if embedded in data attributes or map links)

## JavaScript Injection Template
```javascript
(function() {
    let shops = [];
    let items = document.querySelectorAll('.js-bookmark-item, .list-rst');
    items.forEach(item => {
        let nameEl = item.querySelector('.list-rst__rst-name-target, .rst-name');
        let addressEl = item.querySelector('.list-rst__address, .address');
        let ratingEl = item.querySelector('.list-rst__rating-val, .rating');
        if (nameEl) {
            shops.push({
                name: nameEl.innerText.trim(),
                address: addressEl ? addressEl.innerText.trim() : '',
                rating: ratingEl ? ratingEl.innerText.trim() : '',
                url: nameEl.href || ''
            });
        }
    });
    return JSON.stringify(shops);
})();
```

## Resilience & Anti-Fragility
- **DOM Fallbacks**: Support multiple CSS selector variations to withstand minor site markup updates.
- **Pagination Handling**: Detect "Next Page" (`.c-pagination__arrow--next`) links to crawl multi-page bookmarks safely.
- **Rate Limiting**: Add gentle delays (1.5s - 3s) between page transitions to respect server resources and avoid bot detection.
