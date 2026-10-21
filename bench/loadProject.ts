import type { Page } from '@playwright/test';

/**
 * テストからファイル入出力を操作するためのヘルパー。
 *
 * アプリは File System Access API（`showSaveFilePicker` / `showOpenFilePicker`）を
 * 優先して使うが、ネイティブダイアログは Playwright から操作できない。
 * そこでピッカーを `undefined` にして `<input type="file">` / `<a download>` の
 * フォールバック経路を使わせ、`filechooser` / `download` イベントで捕まえる。
 *
 * 本番コードにテスト専用フックを入れないための仕掛け。
 */
export async function disableFilePickers(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as {
      showSaveFilePicker?: unknown;
      showOpenFilePicker?: unknown;
    };
    w.showSaveFilePicker = undefined;
    w.showOpenFilePicker = undefined;
  });
}

/** 「読み込み」ボタンから JSON を実際のインポート経路で流し込む。 */
export async function loadProjectJson(
  page: Page,
  json: string,
  name = 'project.json'
): Promise<void> {
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: '読み込み' }).click(),
  ]);
  await chooser.setFiles({
    name,
    mimeType: 'application/json',
    buffer: Buffer.from(json, 'utf-8'),
  });
}
