import { defineConfig } from 'wxt';
import { TABELOG_ORIGINS } from './src/infrastructure/permissions/tabelog-origins';

// See https://wxt.dev/api/config.html
export default defineConfig({
  outDir: 'output',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'import2gmap',
    description: '食べログの保存リストをGoogleマイマップへ自動インポートするChrome拡張機能',
    permissions: ['storage', 'activeTab', 'scripting'],
    // 'https://docs.google.com/picker*' (path-narrowed, not the whole docs.google.com origin):
    // the My Maps KML import dialog is a cross-origin docs.google.com/picker iframe, and
    // `scripting.executeScript` into a frame needs host permission for that frame's origin. See
    // ADR-0004 §1 (2026-08-02 addendum) and the spike results' "cross-origin picker iframe" note.
    optional_host_permissions: [
      ...TABELOG_ORIGINS,
      'https://www.google.com/maps/*',
      'https://docs.google.com/picker*',
    ],
    action: {
      default_title: '保存リストを取り込む',
    },
  },
});
