import { useCallback, useEffect, useState } from 'react';
import { buildScreenViewModel } from '@/src/application/popup-view-model';
import { errorMessageFor } from '@/src/domain/errors/error-messages';
import { isWorkerToPopupMessage } from '@/src/domain/messaging/message-types';
import type { PopupToWorkerMessage, UiStateSnapshot } from '@/src/domain/messaging/message-types';
import { TABELOG_ORIGINS } from '@/src/infrastructure/permissions/tabelog-origins';
import './App.css';

const MY_MAPS_ORIGIN = 'https://www.google.com/maps/*';
// The KML upload dialog is a cross-origin docs.google.com/picker iframe (see messaging
// protocol §6 / spike results); executeScript into it needs its own host permission.
const MY_MAPS_PICKER_ORIGIN = 'https://docs.google.com/picker*';
const IN_PROGRESS_POLL_MS = 1_000;
const IN_PROGRESS_UI_STEPS = new Set(['extracting', 'import_starting']);

function sendToWorker(message: PopupToWorkerMessage) {
  return browser.runtime.sendMessage(message);
}

type PermissionError = { readonly code: string; readonly message: string };

export default function App() {
  const [snapshot, setSnapshot] = useState<UiStateSnapshot | undefined>(undefined);
  const [mapNameDraft, setMapNameDraft] = useState('');
  const [permissionError, setPermissionError] = useState<PermissionError | undefined>(undefined);

  const refresh = useCallback(async () => {
    const reply = await sendToWorker({ type: 'GET_UI_STATE', protocolVersion: 1 });
    if (reply?.type === 'UI_STATE') {
      setSnapshot(reply.snapshot);
      setMapNameDraft(reply.snapshot.mapName ?? '');
    }
  }, []);

  const sendAndRefresh = useCallback(
    async (message: PopupToWorkerMessage) => {
      await sendToWorker(message);
      await refresh();
    },
    [refresh],
  );

  useEffect(() => {
    void refresh();
    const listener = (message: unknown) => {
      if (isWorkerToPopupMessage(message)) {
        void refresh();
      }
    };
    browser.runtime.onMessage.addListener(listener);
    return () => browser.runtime.onMessage.removeListener(listener);
  }, [refresh]);

  useEffect(() => {
    if (!snapshot || !IN_PROGRESS_UI_STEPS.has(snapshot.uiStep)) {
      return;
    }
    // Push notifications from the background job aren't always delivered to an open
    // popup in time (MV3 service worker / messaging timing); poll as a backstop so the
    // screen advances on its own instead of requiring the user to reopen the popup.
    const interval = setInterval(() => void refresh(), IN_PROGRESS_POLL_MS);
    return () => clearInterval(interval);
  }, [snapshot, refresh]);

  const handleExtractStart = useCallback(async () => {
    const granted = await browser.permissions.request({ origins: [...TABELOG_ORIGINS] });
    if (!granted) {
      setPermissionError({ code: 'HostPermissionDenied', message: errorMessageFor('HostPermissionDenied') });
      return;
    }
    setPermissionError(undefined);
    await sendAndRefresh({ type: 'EXTRACT_START', protocolVersion: 1 });
  }, [sendAndRefresh]);

  const handleImportStart = useCallback(async () => {
    const granted = await browser.permissions.request({ origins: [MY_MAPS_ORIGIN, MY_MAPS_PICKER_ORIGIN] });
    if (!granted) {
      setPermissionError({ code: 'HostPermissionDenied', message: errorMessageFor('HostPermissionDenied') });
      return;
    }
    setPermissionError(undefined);
    await sendAndRefresh({ type: 'IMPORT_START', protocolVersion: 1, mapName: mapNameDraft });
  }, [mapNameDraft, sendAndRefresh]);

  if (!snapshot) {
    return <main className="popup">読み込み中…</main>;
  }

  if (permissionError) {
    return (
      <main className="popup">
        <h1>保存リストを取り込む</h1>
        <section>
          <p>{permissionError.code}</p>
          <p>{permissionError.message}</p>
          <button onClick={() => setPermissionError(undefined)}>再試行</button>
        </section>
      </main>
    );
  }

  const view = buildScreenViewModel(snapshot);

  return (
    <main className="popup">
      <h1>保存リストを取り込む</h1>

      {view.screen === 'ready' && (
        <section>
          <p>保存リストページを認識しました。</p>
          <button onClick={() => void handleExtractStart()}>抽出する</button>
          <p className="hint">全ページを巡回して店舗情報を抽出します。</p>
        </section>
      )}

      {view.screen === 'wrong_context' && (
        <section>
          <p>食べログのPC版「保存リスト」を開いてから、もう一度お試しください。</p>
          <button disabled>抽出する</button>
        </section>
      )}

      {view.screen === 'extracting' && (
        <section>
          <p>抽出しています…</p>
          {view.progress && <p>{view.progress.shopsCollected} 件収集済み</p>}
          <button
            onClick={() =>
              snapshot.jobId &&
              void sendAndRefresh({ type: 'EXTRACT_CANCEL', protocolVersion: 1, jobId: snapshot.jobId })
            }
          >
            キャンセル
          </button>
        </section>
      )}

      {view.screen === 'extract_complete' && (
        <section>
          <p>{view.shopCount ?? 0} 件の店舗を抽出しました</p>
          {typeof view.collectionCount === 'number' && <p>コレクション {view.collectionCount} 種類</p>}
          <button
            onClick={() => void sendAndRefresh({ type: 'UI_STEP_SET', protocolVersion: 1, uiStep: 'confirm' })}
          >
            次へ
          </button>
          <button onClick={() => void sendAndRefresh({ type: 'EXTRACT_DISCARD', protocolVersion: 1 })}>
            やり直す
          </button>
        </section>
      )}

      {view.screen === 'confirm' && (
        <section>
          <p>店舗数: {view.shopCount ?? 0}</p>
          <p>コレクション: {view.collectionCount ?? 0} 種類</p>
          <label>
            マップ名
            <input
              value={mapNameDraft}
              onChange={(e) => setMapNameDraft(e.target.value)}
              onBlur={() =>
                void sendAndRefresh({ type: 'MAP_NAME_SET', protocolVersion: 1, mapName: mapNameDraft })
              }
            />
          </label>
          <button
            onClick={() =>
              void sendAndRefresh({ type: 'UI_STEP_SET', protocolVersion: 1, uiStep: 'extract_complete' })
            }
          >
            戻る
          </button>
          <button onClick={() => void handleImportStart()}>My Maps へインポート</button>
        </section>
      )}

      {view.screen === 'import_starting' && (
        <section>
          <p>権限確認・My Maps タブ準備中です…</p>
        </section>
      )}

      {view.screen === 'import_succeeded' && (
        <section>
          <p>「{view.mapName}」に{view.shopCount ?? 0}件の店舗をインポートしました。</p>
          <button onClick={() => void sendAndRefresh({ type: 'EXTRACT_DISCARD', protocolVersion: 1 })}>
            完了
          </button>
        </section>
      )}

      {view.screen === 'error' && (
        <section>
          <p>{view.code}</p>
          <p>{view.message}</p>
          {view.canRetry ? (
            <button onClick={() => void sendAndRefresh({ type: 'ERROR_RETRY', protocolVersion: 1 })}>
              再試行
            </button>
          ) : (
            <button onClick={() => void sendAndRefresh({ type: 'ERROR_RETRY', protocolVersion: 1 })}>
              閉じる
            </button>
          )}
        </section>
      )}
    </main>
  );
}
