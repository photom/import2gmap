# Sequence and Data Flow Architecture

## 1. Sequence Diagram

The following sequence diagram illustrates the user interaction, multi-page web scraping workflow, domain model transformations, Google OAuth2 authentication, and Google My Maps cloud upload.

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant WebView as WebView (Tabelog)
    participant Scraper as ScrapeTabelogUseCase
    participant AppState as AppViewModel / StateFlow
    participant Exporter as ExportToGoogleMapsUseCase
    participant GoogleAPI as Google Drive / My Maps API

    User->>WebView: 1. ログイン ＆ 保存リスト（お気に入り）ページを開く
    User->>AppState: 2. 「保存リストをインポート」ボタン押下
    AppState->>Scraper: 3. スクレイピング開始 (ScrapeTabelogUseCase)
    
    loop 全件取得（さらに読み込む）
        Scraper->>WebView: 4. DOMパース JavaScript インジェクション
        WebView-->>Scraper: 5. 店舗要素リスト (DOM HTML) 返却
        Scraper->>Scraper: 6. Restaurant 断片へ変換 ＆ load-more 状態取得
        alt さらに読み込むあり
            Scraper->>WebView: 7. get-next-items クリック＆DOM追記待ち
        end
    end

    loop 各店舗 URL（住所 enrichment）
        Scraper->>WebView: 店舗詳細を開き住所を決め打ち抽出
    end

    alt パース失敗時
        Scraper-->>AppState: エラー発生 (ScrapingException)
        AppState-->>User: 8a. 詳細エラーメッセージ表示
    else パース成功時
        Scraper-->>AppState: 全店舗リスト List<Restaurant>
        AppState-->>User: 8b. 抽出プレビュー画面表示 (ImportPreviewScreen)
    end

    User->>AppState: 9. 「GoogleMapへ取り込む」ボタン押下
    AppState->>Exporter: 10. インポート処理開始
    Exporter->>User: 11. Google OAuth2 ログイン承認要求
    User-->>Exporter: 12. OAuth2 承認完了 (Access Token)
    Exporter->>Exporter: 13. KML ドキュメント生成 (KmlDocument)
    Exporter->>GoogleAPI: 14. KML を Google Drive / マイマップへアップロード
    
    alt API失敗時
        GoogleAPI-->>Exporter: API Error
        Exporter-->>AppState: ImportException
        AppState-->>User: 15a. 明示的エラーメッセージ表示
    else API成功時
        GoogleAPI-->>Exporter: Upload Success (Map URL)
        Exporter-->>AppState: ImportSuccess (Map URL)
        AppState-->>User: 15b. 取り込み完了画面＆Google Maps起動リンク表示
    end
```

---

## 2. Data Flow & Domain Entities

### 2.1. Extraction & My Maps Field Contract

| Domain field | Meaning | My Maps / KML |
| :--- | :--- | :--- |
| `name` | 店舗名 | `<Placemark><name>` |
| `address` | 住所 | `<address>` |
| `url` | 食べログ店舗 URL | `<description>`（URL を description に載せる） |

Out of scope for scrape and KML: rating, genre, phone, notes, personal/account data.

Hardcoded DOM extraction design: [`tabelog-scraping-extraction-spec.md`](./tabelog-scraping-extraction-spec.md).

### 2.2. Domain Model

```mermaid
classDiagram
    class Restaurant {
        +String id
        +String name
        +String address
        +String url
    }

    class SavedList {
        +String listTitle
        +List~Restaurant~ items
        +Int totalCount
    }

    class KmlDocument {
        +String title
        +List~Restaurant~ restaurants
        +String toXmlString()
    }

    class ScrapingResult {
        +SavedList list
        +ScrapingStatus status
        +String errorMessage
    }

    SavedList "1" *-- "many" Restaurant
    KmlDocument "1" *-- "many" Restaurant
```

### 2.3. KML Placemark Mapping (per restaurant)

```xml
<Placemark>
  <name><!-- Restaurant.name --></name>
  <description><![CDATA[
    <!-- Restaurant.url (食べログ URL) -->
  ]]></description>
  <address><!-- Restaurant.address --></address>
</Placemark>
```
