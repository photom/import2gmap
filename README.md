# import2gmap (Chrome Extension Project)

このプロジェクトは、食べログの保存リスト（お気に入り）店舗情報をデスクトップ Chrome 拡張経由で全ページパース・抽出を行い、My Maps Web UI 自動操作で Google マップへ一括インポートする Chrome 拡張機能です。

---

## 📂 プロジェクトドキュメント構成 (Diátaxis Structure)

```text
docs/
├── tutorials/       # [Tutorials] 初回セットアップ・起動ガイド
├── how-to/          # [How-To Guides] 具体的なデータ抽出・マップインポート手順
├── reference/       # [Reference] 拡張 UI・セレクタ・データフロー仕様
└── explanation/     # [Explanation] アーキテクチャ選定理由 (ADR)、セキュリティ設計
    └── adr/
        └── 0003-chrome-extension-my-maps-web-import.md
```

### 主要ドキュメントへのリンク
- Chrome 拡張アーキテクチャ (ADR-0003): [0003-chrome-extension-my-maps-web-import.md](docs/explanation/adr/0003-chrome-extension-my-maps-web-import.md)
