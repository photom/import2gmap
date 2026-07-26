# import2gmap (Android App Project)

このプロジェクトは、食べログの保存リスト（お気に入り）店舗情報をAndroidアプリ（WebView）経由で全ページパース・抽出を行い、Google OAuth2 ＋ Google Drive / My Maps API 経由で Google マップへ一括インポートする Android アプリケーションです。

---

## 📂 プロジェクトドキュメント構成 (Diátaxis Structure)

```text
docs/
├── tutorials/       # [Tutorials] 初回セットアップ・起動ガイド
├── how-to/          # [How-To Guides] 具体的なデータ抽出・マップインポート手順
├── reference/       # [Reference] 画面仕様書、シーケンス図、データフロー仕様
│   ├── screen-specifications.md
│   └── sequence-and-data-flow.md
└── explanation/     # [Explanation] アーキテクチャ選定理由 (ADR)、セキュリティ設計
    └── adr/
        ├── 0001-architecture-and-development-process.md
        └── 0002-tabelog-to-google-maps-import-architecture.md
```

### 主要ドキュメントへのリンク
- 画面仕様書 & エラーハンドリング仕様: [screen-specifications.md](file:///home/sthin/work/import2gmap/docs/reference/screen-specifications.md)
- シーケンス図 & データフロー: [sequence-and-data-flow.md](file:///home/sthin/work/import2gmap/docs/reference/sequence-and-data-flow.md)
- 建築設計決定 (ADR-0001): [0001-architecture-and-development-process.md](file:///home/sthin/work/import2gmap/docs/explanation/adr/0001-architecture-and-development-process.md)
- インポートアーキテクチャ (ADR-0002): [0002-tabelog-to-google-maps-import-architecture.md](file:///home/sthin/work/import2gmap/docs/explanation/adr/0002-tabelog-to-google-maps-import-architecture.md)
