/**
 * ファイルの保存・読み込みをブラウザ API で行うモジュール。
 *
 * 第 1 候補は File System Access API（`showSaveFilePicker` / `showOpenFilePicker`）。
 * 「保存先を選んで書き込む」というデスクトップアプリ相当の UX を提供でき、
 * Chrome / Edge（localhost は secure context）で利用できる。
 *
 * ピッカーが無い・呼び出しに失敗した場合は `<a download>` / `<input type="file">`
 * にフォールバックする。フォールバックは全ブラウザで動作するが、保存先は
 * ブラウザ既定のダウンロードフォルダになる。
 */

/** 保存・読み込みダイアログに渡すファイル種別。 */
export interface FileKind {
  /** ダイアログに表示する説明（例: 'Project JSON'）。 */
  description: string;
  /** MIME タイプ（例: 'application/json'）。 */
  mime: string;
  /** 拡張子（例: ['.json']）。accept 属性にも使う。 */
  extensions: string[];
}

export type SaveOutcome = 'saved' | 'canceled';

/**
 * 書き込むデータ。関数を渡すと、保存先ピッカーを開いた**後**に評価される。
 *
 * File System Access API のピッカーはユーザーアクティベーション中にしか
 * 呼べないため、Excel 生成のような重い処理はピッカーの後ろに回す必要がある。
 */
export type BinarySource = Uint8Array | (() => Promise<Uint8Array>);

export interface FileIO {
  saveText(suggestedName: string, text: string, kind: FileKind): Promise<SaveOutcome>;
  saveBinary(
    suggestedName: string,
    kind: FileKind,
    data: BinarySource
  ): Promise<SaveOutcome>;
  openText(kind: FileKind): Promise<string | null>;
}

export const PROJECT_JSON_KIND: FileKind = {
  description: 'Project JSON',
  mime: 'application/json',
  extensions: ['.json'],
};

export const EXCEL_KIND: FileKind = {
  description: 'Excel Workbook',
  mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  extensions: ['.xlsx'],
};

// ── File System Access API の最小型定義 ────────────────────────────────────
// `lib.dom` には picker 系がまだ入っていないため、必要な範囲だけ自前で定義する。

interface PickerType {
  description?: string;
  accept: Record<string, string[]>;
}

interface WritableStreamLike {
  write(data: BufferSource | Blob | string): Promise<void>;
  close(): Promise<void>;
  abort?(): Promise<void>;
}

interface FileHandleLike {
  getFile(): Promise<File>;
  createWritable(): Promise<WritableStreamLike>;
}

type PickerWindow = Window & {
  showSaveFilePicker?: (options?: {
    suggestedName?: string;
    types?: PickerType[];
  }) => Promise<FileHandleLike>;
  showOpenFilePicker?: (options?: {
    multiple?: boolean;
    types?: PickerType[];
  }) => Promise<FileHandleLike[]>;
};

function pickerWindow(): PickerWindow | null {
  if (typeof window === 'undefined') return null;
  return window as PickerWindow;
}

function toPickerType(kind: FileKind): PickerType {
  return { description: kind.description, accept: { [kind.mime]: kind.extensions } };
}

/** ピッカーのキャンセル（AbortError）かどうか。 */
function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name?: unknown }).name === 'AbortError'
  );
}

/** `<a download>` でダウンロードさせる（ピッカー非対応環境のフォールバック）。 */
function downloadBlob(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // ダウンロード開始前に revoke すると失敗するブラウザがあるため遅延させる。
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** ピッカーで保存先を選ぶ。キャンセルなら 'canceled'、非対応・失敗なら null。 */
async function pickSaveHandle(
  name: string,
  kind: FileKind
): Promise<FileHandleLike | null | 'canceled'> {
  const win = pickerWindow();
  if (!win || typeof win.showSaveFilePicker !== 'function') return null;

  try {
    return await win.showSaveFilePicker({
      suggestedName: name,
      types: [toPickerType(kind)],
    });
  } catch (error) {
    if (isAbortError(error)) return 'canceled';
    // SecurityError 等。ダウンロードにフォールバックする。
    console.warn('showSaveFilePicker に失敗したためダウンロードに切り替えます', error);
    return null;
  }
}

async function writeTo(
  handle: FileHandleLike,
  data: BufferSource | Blob | string
): Promise<void> {
  const writable = await handle.createWritable();
  try {
    await writable.write(data);
    await writable.close();
  } catch (error) {
    // 書き込み途中で失敗したら中途半端なファイルを残さない。
    try {
      await writable.abort?.();
    } catch {
      /* abort 自体の失敗は無視する */
    }
    throw error;
  }
}

async function saveText(
  suggestedName: string,
  text: string,
  kind: FileKind
): Promise<SaveOutcome> {
  const handle = await pickSaveHandle(suggestedName, kind);
  if (handle === 'canceled') return 'canceled';

  if (handle) {
    await writeTo(handle, text);
    return 'saved';
  }

  downloadBlob(suggestedName, new Blob([text], { type: kind.mime }));
  return 'saved';
}

async function saveBinary(
  suggestedName: string,
  kind: FileKind,
  data: BinarySource
): Promise<SaveOutcome> {
  const produce = typeof data === 'function' ? data : async () => data;

  // ピッカーを先に開く（ユーザーアクティベーションを消費しないため）。
  const handle = await pickSaveHandle(suggestedName, kind);
  if (handle === 'canceled') return 'canceled';

  const bytes = await produce();

  if (handle) {
    // Uint8Array<ArrayBufferLike> と BufferSource の型差を吸収する。
    await writeTo(handle, bytes as unknown as BufferSource);
    return 'saved';
  }

  downloadBlob(suggestedName, new Blob([bytes as unknown as BlobPart], { type: kind.mime }));
  return 'saved';
}

/** ピッカー非対応環境用の読み込み。キャンセル時は null。 */
function openTextWithInput(kind: FileKind): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = kind.extensions.join(',');
    input.style.display = 'none';

    let settled = false;
    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      input.remove();
      window.removeEventListener('focus', onWindowFocus);
      resolve(value);
    };

    const readFile = async () => {
      const file = input.files?.[0];
      if (!file) {
        finish(null);
        return;
      }
      try {
        finish(await file.text());
      } catch (error) {
        console.error('ファイルの読み込みに失敗しました', error);
        finish(null);
      }
    };

    // `cancel` 非対応のブラウザ向け: ダイアログが閉じてウィンドウに戻ったら
    // 少し待って「選択されていなければキャンセル」とみなす。
    const onWindowFocus = () => {
      window.setTimeout(() => {
        if (!input.files || input.files.length === 0) finish(null);
      }, 500);
    };

    input.addEventListener('change', readFile);
    input.addEventListener('cancel', () => finish(null));
    window.addEventListener('focus', onWindowFocus, { once: true });

    document.body.appendChild(input);
    input.click();
  });
}

async function openText(kind: FileKind): Promise<string | null> {
  const win = pickerWindow();
  if (win && typeof win.showOpenFilePicker === 'function') {
    try {
      const [handle] = await win.showOpenFilePicker({
        multiple: false,
        types: [toPickerType(kind)],
      });
      if (!handle) return null;
      const file = await handle.getFile();
      return await file.text();
    } catch (error) {
      if (isAbortError(error)) return null;
      console.warn('showOpenFilePicker に失敗したためファイル選択に切り替えます', error);
    }
  }

  return openTextWithInput(kind);
}

/** ブラウザ実装。アプリからはこれを使う。 */
export const browserFileIO: FileIO = {
  saveText,
  saveBinary,
  openText,
};
