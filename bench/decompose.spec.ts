/**
 * 描画性能の分解用ハーネス（P1 Step 4 で追加）。
 *
 * `npm run bench`（perf.spec.ts）は操作ごとの「main-thread ブロック合計」しか出さない。
 * ここでは CDP の CPU プロファイラを使い、commit 1 回の時間が
 * 「flattenTree / タイムライン再計算 / React の行再描画 / selector 実行」の
 * どこに落ちているかを自己時間（self time）で切り分ける。
 *
 * 実行:
 *   DECOMPOSE=1 npx playwright test --config playwright.bench.config.ts bench/decompose.spec.ts
 * 結果は bench/results/decompose.json に出力（bench/results は .gitignore 済み）。
 * （DECOMPOSE=1 を付けない場合、`npm run bench` ではスキップされる）
 *
 * 注: ヘッドレス Chromium では JS 外の時間（style/layout/paint 等）が
 * `(program)` として大きく出る。JS 側の内訳は self time の上位関数で判断する。
 * 「全行が再描画されているか」を正確に見たい場合は、一時的に各コンポーネントへ
 * 描画カウンタ（window.__rc）を仕込む（計測後に削除する。bench/README.md 参照）。
 */
import { test, expect } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { Page } from '@playwright/test';

interface BenchTask {
  id: string;
  planStartDate?: string | null;
  children: string[];
}
interface BenchProjectData {
  tasks: Record<string, BenchTask>;
  rootIds: string[];
}
interface CdpProfileNode {
  id: number;
  callFrame: { functionName: string; url: string; lineNumber: number };
}
interface CdpProfile {
  nodes: CdpProfileNode[];
  samples: number[];
  timeDeltas: number[];
  startTime: number;
  endTime: number;
}
interface Aggregated {
  key: string;
  selfMs: number;
  samples: number;
}

function loadFixture(size: number): BenchProjectData {
  const file = new URL(`./fixtures/tasks-${size}.json`, import.meta.url);
  return JSON.parse(readFileSync(file, 'utf8')) as BenchProjectData;
}

function flattenIds(data: BenchProjectData): string[] {
  const result: string[] = [];
  const walk = (ids: string[]) => {
    for (const id of ids) {
      const task = data.tasks[id];
      if (!task) continue;
      result.push(id);
      walk(task.children);
    }
  };
  walk(data.rootIds);
  return result;
}

function shortUrl(url: string): string {
  if (!url) return '';
  const clean = url.split('?')[0];
  const parts = clean.split('/');
  return parts[parts.length - 1] || clean;
}

/** 自己時間（その関数自身が main-thread を占有した時間）で降順に集計する。 */
function aggregate(profile: CdpProfile): Aggregated[] {
  const byId = new Map<number, CdpProfileNode>();
  for (const node of profile.nodes) byId.set(node.id, node);
  const self = new Map<string, { ms: number; count: number }>();
  for (let i = 0; i < profile.samples.length; i += 1) {
    const node = byId.get(profile.samples[i]);
    if (!node) continue;
    const dt = profile.timeDeltas[i] ?? 0;
    const name = node.callFrame.functionName || '(anonymous)';
    const url = shortUrl(node.callFrame.url);
    const key = url ? `${name} @ ${url}` : `${name}`;
    const entry = self.get(key) ?? { ms: 0, count: 0 };
    entry.ms += dt / 1000;
    entry.count += 1;
    self.set(key, entry);
  }
  return [...self.entries()]
    .map(([key, value]) => ({ key, selfMs: Math.round(value.ms * 100) / 100, samples: value.count }))
    .sort((a, b) => b.selfMs - a.selfMs);
}

async function profileAction(
  page: Page,
  action: () => Promise<void>
): Promise<{ profile: CdpProfile; wallMs: number }> {
  const client = await page.context().newCDPSession(page);
  await client.send('Profiler.enable');
  await client.send('Profiler.setSamplingInterval', { interval: 200 });
  await client.send('Profiler.start');
  const t0 = Date.now();
  await action();
  await page.waitForTimeout(150);
  const wallMs = Date.now() - t0;
  const { profile } = await client.send('Profiler.stop');
  await client.detach();
  return { profile: profile as CdpProfile, wallMs };
}

/** targetIndex は画面上部（25 行未満）にあり、今日に最も近いリーフタスク。 */
function pickTargetIndex(data: BenchProjectData): number {
  const orderedIds = flattenIds(data);
  const today = new Date();
  const todayMs = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  let targetIndex = -1;
  let bestDelta = Number.POSITIVE_INFINITY;
  orderedIds.forEach((id, index) => {
    const task = data.tasks[id];
    if (!task || task.children.length > 0 || !task.planStartDate) return;
    if (index >= 24) return;
    const delta = Math.abs(new Date(task.planStartDate).getTime() - todayMs);
    if (delta < bestDelta) {
      bestDelta = delta;
      targetIndex = index;
    }
  });
  return targetIndex;
}

async function installHarness(page: Page, projectJson: string) {
  await page.addInitScript((json: string) => {
    (window as unknown as { ipcRenderer: unknown }).ipcRenderer = {
      invoke: async (channel: string) => (channel === 'load-file' ? json : null),
      send: () => {},
      on: () => () => {},
    };
  }, projectJson);
}

test('decompose: 1,000 タスクの commit / hover を CPU プロファイルで分解', async ({ page }) => {
  test.skip(
    process.env.DECOMPOSE !== '1',
    'DECOMPOSE=1 のときだけ実行する（通常の npm run bench ではスキップ）'
  );
  const data = loadFixture(1000);
  const targetIndex = pickTargetIndex(data);
  expect(targetIndex).toBeGreaterThanOrEqual(0);

  await installHarness(page, JSON.stringify(data));
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: '読み込み' }).click();
  await expect(page.locator('input[data-field="title"]')).toHaveCount(1000, { timeout: 120_000 });
  await page.waitForTimeout(500);

  const results: Record<string, { wallMs: number; top: Aggregated[] }> = {};

  // ── duration type(3) + Enter commit ────────────────────────────────
  const durationCell = page.locator('.gantt-row-optimized').nth(targetIndex).locator('input[data-field="duration"]');
  await durationCell.scrollIntoViewIfNeeded();
  await durationCell.click();
  await page.keyboard.press('ControlOrMeta+a');
  {
    const { profile, wallMs } = await profileAction(page, async () => {
      await page.keyboard.type('123', { delay: 10 });
      await page.keyboard.press('Enter');
    });
    results['duration type(3)+Enter'] = { wallMs, top: aggregate(profile).slice(0, 40) };
  }

  // ── title Enter commit（新規タスク追加）────────────────────────────
  const titleCell = page.locator('.gantt-row-optimized').nth(targetIndex).locator('input[data-field="title"]');
  await titleCell.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('decompose');
  await page.waitForTimeout(200);
  {
    const { profile, wallMs } = await profileAction(page, async () => {
      await page.keyboard.press('Enter');
    });
    results['title Enter commit'] = { wallMs, top: aggregate(profile).slice(0, 40) };
  }

  // ── hover(20 rows) ────────────────────────────────────────────────
  const firstRowBox = await page.locator('.gantt-row-optimized').first().boundingBox();
  expect(firstRowBox).not.toBeNull();
  const hoverX = (firstRowBox?.x ?? 0) + 200;
  const hoverY = (row: number) => (firstRowBox?.y ?? 0) + row * 32 + 16;
  for (let i = 0; i < 6; i += 1) await page.mouse.move(hoverX, hoverY(i + 1), { steps: 1 });
  {
    const { profile, wallMs } = await profileAction(page, async () => {
      for (let row = 1; row <= 20; row += 1) {
        await page.mouse.move(hoverX, hoverY(row), { steps: 1 });
      }
    });
    results['hover(20 rows)'] = { wallMs, top: aggregate(profile).slice(0, 40) };
  }

  for (const [label, value] of Object.entries(results)) {
    console.log(`\n=== ${label} (wall=${value.wallMs}ms) ===`);
    for (const row of value.top) {
      console.log(`  ${row.selfMs.toFixed(1).padStart(8)}ms  ${String(row.samples).padStart(6)}  ${row.key}`);
    }
  }

  const resultsDir = new URL('./results/', import.meta.url);
  mkdirSync(resultsDir, { recursive: true });
  writeFileSync(new URL('decompose.json', resultsDir), JSON.stringify(results, null, 2), 'utf8');
});
