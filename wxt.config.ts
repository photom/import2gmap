import { defineConfig } from 'wxt';
import { TABELOG_ORIGINS } from './src/infrastructure/permissions/tabelog-origins';
import { GOOGLE_MAPS_ORIGINS } from './src/infrastructure/permissions/google-maps-origins';

// See https://wxt.dev/api/config.html
export default defineConfig({
  outDir: 'output',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    version: '0.1.0',
    name: 'tabelog2gmap',
    description: '食べログの保存リストをGoogleマップの保存リストへ自動インポートするChrome拡張機能',
    permissions: ['storage', 'activeTab', 'scripting'],
    // ADR-0008: the import target is Google Maps' native saved-list UI, not My Maps — no
    // docs.google.com/picker* iframe origin is needed here (that was specific to the superseded
    // My Maps KML upload dialog).
    optional_host_permissions: [...TABELOG_ORIGINS, ...GOOGLE_MAPS_ORIGINS],
    action: {
      default_title: '保存リストを取り込む',
    },
  },
});
