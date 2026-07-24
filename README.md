# Tabelog to Google Maps Exporter (Android App Project)

このプロジェクトは、食べログのお気に入り店舗情報をAndroidアプリ（WebView）経由でパース・抽出を行い、KMLフォーマットに変換の上、Google Mapsアプリに一括送信（インテント連携）するプロジェクトです。

---

## 🤖 Antigravity AI エージェントへの指示 (Agent Instructions)

> **IMPORTANT FOR ANTIGRAVITY AGENT:**  
> 本プロジェクトにおけるコード実装、画面設計、セキュリティ確認、ドキュメント作成の際は、必ず以下の `.gemini/skills/` 配下に定義されたカスタムスキルを参照し、定義された原則・規約に厳格に従って実行すること。

### 利用可能なカスタムスキル一覧 (`.gemini/skills/`)

1. **[Android App Development Skill](file:///.gemini/skills/android-app-development/SKILL.md)**
   - **用途**: Kotlin, Jetpack Compose, Coroutines, FileProvider, Intent連携の実装
   - **指示**: Androidコードを書く際は、ViewModel, StateFlow, Coroutinesのベストプラクティスを遵守すること。

2. **[Android UI Development Skill](file:///.gemini/skills/android-ui-development/SKILL.md)**
   - **用途**: 上部WebView ＋ 下部Composeコントロールパネルのレスポンシブレイアウト設計
   - **指示**: UIコンポーネントおよびState設計はこのガイドラインに従うこと。

3. **[Web Scraping & DOM Parsing Skill](file:///.gemini/skills/web-scraping-dom-parsing/SKILL.md)**
   - **用途**: WebViewへのJavaScriptインジェクションおよび食べログDOMパース処理
   - **指示**: DOM抽出スクリプトの作成・修正時は、エラーハンドリングとフォールバック処理を実装すること。

4. **[GIS & KML Conversion Skill](file:///.gemini/skills/gis-kml-conversion/SKILL.md)**
   - **用途**: 抽出データから KML (XML) フォーマットへの変換およびIntent起動処理
   - **指示**: OGC KML 2.2規格に準拠したXML生成コードを出力すること。

5. **[Android Security & Privacy Skill](file:///.gemini/skills/android-security-privacy/SKILL.md)**
   - **用途**: WebViewセキュリティ設定、パスワード非保持原則、FileProvider連携
   - **指示**: ユーザー資格情報のローカル保持を一切行わず、WebViewの設定を保護すること。

6. **[Diátaxis Documentation Skill](file:///.gemini/skills/diataxis-documentation/SKILL.md)**
   - **用途**: 仕様書・ドキュメント作成時の分類（Tutorials, How-To, Reference, Explanation）
   - **指示**: ドキュメント作成時はDiátaxisの4つの分類に基づいて構成すること。

---

## 📂 プロジェクトドキュメント構成 (Diátaxis Structure)

```text
docs/
├── tutorials/       # [Tutorials] 初回セットアップ・起動ガイド
├── how-to/          # [How-To Guides] 具体的なデータ抽出・マップインポート手順
├── reference/       # [Reference] 画面仕様書、画面遷移図、KMLスキーマ、API仕様
└── explanation/     # [Explanation] アーキテクチャ選定理由、セキュリティ設計
```
