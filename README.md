# import2gmap (Chrome Extension Project)

このプロジェクトは、食べログの保存リスト（お気に入り）店舗情報をデスクトップ Chrome 拡張経由で全ページパース・抽出を行い、My Maps Web UI 自動操作で Google マップへ一括インポートする Chrome 拡張機能です。

---

## 📂 プロジェクトドキュメント構成 (Diátaxis Structure)

```text
docs/
├── tutorials/       # [Tutorials] 初回セットアップ・起動ガイド
├── how-to/          # [How-To Guides] 具体的なデータ抽出・マップインポート手順
├── reference/       # [Reference] 拡張 UI・セレクタ・データフロー仕様
│   ├── extension-ui-specifications.md
│   ├── extension-messaging-protocol.md
│   ├── extension-session-storage-schema.md
│   ├── extension-error-codes.md
│   ├── extension-extract-confirm-sequences.md
│   ├── tabelog-pc-saved-list-extraction-spec.md
│   ├── kml-data-schema.md
│   └── html-fixture-policy.md
└── explanation/     # [Explanation] アーキテクチャ選定理由 (ADR)、設計説明
    ├── chrome-extension-decision-checklist.md
    ├── extension-ui-design.md
    ├── pc-saved-list-extraction-design.md
    ├── security-privacy-model.md
    └── adr/
        ├── 0003-chrome-extension-my-maps-web-import.md
        ├── 0004-extension-implementation-baseline.md
        └── 0005-extract-collections-for-future-pin-styling.md
```

### 主要ドキュメントへのリンク
- 意思決定チェックリスト: [chrome-extension-decision-checklist.md](docs/explanation/chrome-extension-decision-checklist.md)
- 拡張 UI 仕様: [extension-ui-specifications.md](docs/reference/extension-ui-specifications.md)
- 拡張 UI 設計: [extension-ui-design.md](docs/explanation/extension-ui-design.md)
- メッセージプロトコル: [extension-messaging-protocol.md](docs/reference/extension-messaging-protocol.md)
- Session スキーマ: [extension-session-storage-schema.md](docs/reference/extension-session-storage-schema.md)
- エラーコード一覧: [extension-error-codes.md](docs/reference/extension-error-codes.md)
- 抽出〜確認シーケンス: [extension-extract-confirm-sequences.md](docs/reference/extension-extract-confirm-sequences.md)
- KML データスキーマ: [kml-data-schema.md](docs/reference/kml-data-schema.md)
- HTML fixture 方針: [html-fixture-policy.md](docs/reference/html-fixture-policy.md)
- セキュリティ／プライバシー: [security-privacy-model.md](docs/explanation/security-privacy-model.md)
- Chrome 拡張アーキテクチャ (ADR-0003): [0003-chrome-extension-my-maps-web-import.md](docs/explanation/adr/0003-chrome-extension-my-maps-web-import.md)
- 実装ベースライン (ADR-0004): [0004-extension-implementation-baseline.md](docs/explanation/adr/0004-extension-implementation-baseline.md)
- コレクション抽出 (ADR-0005): [0005-extract-collections-for-future-pin-styling.md](docs/explanation/adr/0005-extract-collections-for-future-pin-styling.md)
- PC版保存リスト抽出仕様: [tabelog-pc-saved-list-extraction-spec.md](docs/reference/tabelog-pc-saved-list-extraction-spec.md)
- PC版保存リスト抽出設計: [pc-saved-list-extraction-design.md](docs/explanation/pc-saved-list-extraction-design.md)
