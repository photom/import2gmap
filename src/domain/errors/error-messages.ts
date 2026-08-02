export const ERROR_MESSAGES: Record<string, string> = {
  NotSavedListPage: '食べログのPC版「保存リスト」ページを開いてから、もう一度お試しください。',
  WrongTab: '取り込み対象のタブがありません。保存リストを表示したタブで拡張機能を開いてください。',
  HostPermissionDenied: 'サイトへのアクセスが許可されませんでした。許可したうえで再試行してください。',
  ProtocolMismatch: '拡張機能の通信バージョンが一致しません。拡張機能を再読み込みしてください。',
  EmptyList: '保存リストに店舗が見つかりませんでした。',
  ItemNameMissing: '店舗名を取得できない項目がありました。',
  ItemUrlMissing: '店舗URLを取得できない項目がありました。',
  InvalidShopUrl: '不正な店舗URLが含まれていました。',
  AddressMissing: '住所を取得できない項目がありました。',
  SelectorDrift: 'ページ構造が想定と異なります。時間をおいて再試行するか、仕様の更新が必要です。',
  BookmarksDataInvalid: 'コレクション情報の読み取りに失敗しました。',
  CollectionCatalogInvalid: 'コレクション一覧の読み取りに失敗しました。',
  IncompleteCrawl: '表示件数と抽出件数が一致しません。最後まで取得できませんでした。',
  ExtractCancelled: '抽出をキャンセルしました。',
  TabNavigatedAway: '抽出中にページが移動したため中断しました。',
  TabClosed: '抽出中のタブが閉じられました。',
  ExtractTimeout: '抽出が時間内に終わりませんでした。',
  SessionCorrupt: '保存中のデータが壊れていました。もう一度抽出してください。',
  SessionQuotaExceeded: '保存容量を超えたため抽出結果を保持できません。',
  NoExtractResult: 'インポートできる抽出結果がありません。先に抽出してください。',
  InvalidMapName: 'マップ名を入力してください。',
  InternalError: '予期しないエラーが発生しました。',
  MyMapsTabOpenFailed: 'Googleマイマップのタブを開けませんでした。',
  MyMapsNotReady: 'マイマップページの準備を確認できませんでした。ログイン状態を確認して再試行してください。',
  MyMapsUiChanged: 'マイマップの画面構成が想定と異なります。',
  ImportCancelled: 'インポートをキャンセルしました。',
};

export function errorMessageFor(code: string): string {
  return ERROR_MESSAGES[code] ?? '予期しないエラーが発生しました。';
}
