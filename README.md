# import2gmap (Chrome Extension Project)

このプロジェクトは、食べログの保存リスト（お気に入り）店舗情報をデスクトップ Chrome 拡張経由で全ページパース・抽出を行い、My Maps Web UI 自動操作で Google マップへ一括インポートする Chrome 拡張機能です。

---

## 📂 プロジェクトドキュメント構成 (Diátaxis Structure)

```text
docs/
├── tutorials/       # [Tutorials] 初回セットアップ・起動ガイド
├── how-to/          # [How-To Guides] 具体的なデータ抽出・マップインポート手順
├── reference/       # [Reference] 拡張 UI・セレクタ・データフロー仕様
│   └── tabelog-pc-saved-list-extraction-spec.md
└── explanation/     # [Explanation] アーキテクチャ選定理由 (ADR)、設計説明
    ├── chrome-extension-decision-checklist.md
    ├── pc-saved-list-extraction-design.md
    └── adr/
        ├── 0003-chrome-extension-my-maps-web-import.md
        └── 0004-extension-implementation-baseline.md
```

### 主要ドキュメントへのリンク
- 意思決定チェックリスト: [chrome-extension-decision-checklist.md](docs/explanation/chrome-extension-decision-checklist.md)
- Chrome 拡張アーキテクチャ (ADR-0003): [0003-chrome-extension-my-maps-web-import.md](docs/explanation/adr/0003-chrome-extension-my-maps-web-import.md)
- 実装ベースライン (ADR-0004): [0004-extension-implementation-baseline.md](docs/explanation/adr/0004-extension-implementation-baseline.md)
- PC版保存リスト抽出仕様: [tabelog-pc-saved-list-extraction-spec.md](docs/reference/tabelog-pc-saved-list-extraction-spec.md)
- PC版保存リスト抽出設計: [pc-saved-list-extraction-design.md](docs/explanation/pc-saved-list-extraction-design.md)
