/**
 * Playwright ベースの描画性能ベンチマーク（P1: 描画性能 Step 0 の計測用）。
 *
 * アプリを実ブラウザ（Chromium）で起動し、`window.ipcRenderer` をスタブして
 * サンプル JSON を「読み込み」ボタンから実際のインポート経路で流し込む。
 *
 * 計測対象:
 *   (a) ガントバーをドラッグしたときのフレーム時間
 *   (b) タイトル確定（Enter）/ duration セルへの文字入力時のフレーム時間
 *   (c) 行ホバー時のフレーム時間
 *   (d) 依存関係ハンドルのドラッグ中 mousemove（= setMousePos のみ。タスクデータは
 *       変わらないので「購読ファンアウトの通知コスト」だけを分離して観測できる）
 *
 * (a) はさらに 3 つに分けて観測する（Step 2 の効果はドラッグ中 mousemove に出るため）:
 *   - `drag bar (30 moves)`        : ドラッグ全体（mousemove + mouseup の確定コミット）
 *   - `drag mousemove only (...)`  : ページ内で合成 mousemove を 30 回送出（確定を含まない）
 *   - `drag commit (mouseup)`      : mouseup による確定コミットのみ
 * 合成 mousemove を使うのは、`page.mouse.move` の 1 回ごとの CDP 往復待ちが
 * アプリ側の差を埋もれさせてしまうため（毎回 macrotask を 1 つ挟んで React の
 * 再描画を発生させ、その区間の実時間を測る）。
 *
 * 実行: npm run bench
 *
 * 計測値の読み方:
 * - ヘッドレス Chromium の requestAnimationFrame は vsync に同期しないため、
 *   フレーム差分は補助情報として扱う。主指標は `PerformanceObserver` の
 *   longtask（メインスレッドを 50ms 以上ブロックしたタスク）と、操作窓の実時間。
 * - 各操作の計測窓には、最後のイベントのコミットを含めるための 120ms の待機が含まれる。
 */
import { test, expect } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

interface BenchTask {
  id: string;
  startDate?: string | null;
  children: string[];
}
interface BenchProjectData {
  tasks: Record<string, BenchTask>;
  rootIds: string[];
}
interface FrameRecording {
  frames: number[];
  longTasks: number[];
  durationMs: number;
}
interface PerfHarness {
  start(): void;
  stop(): FrameRecording;
}
type PerfWindow = Window & { __perf?: PerfHarness; ipcRenderer?: unknown };

interface InteractionStat {
  label: string;
  runs: number;
  windowMsPerRun: number;
  framesPerRun: number;
  frameMeanMs: number;
  frameP50Ms: number;
  frameP95Ms: number;
  frameMaxMs: number;
  over33ms: number;
  over50ms: number;
  longTasksPerRun: number;
  longTaskTotalMsPerRun: number;
  longestTaskMs: number;
}

const SIZES = [100, 1000];
const VIEWPORT = { width: 1600, height: 900 };
const REPEAT_READ_ONLY = 3;
// ページ内で合成 mousemove を連続送出する計測の反復回数（ノイズ低減のため多め）。
const REPEAT_SYNTHETIC = 5;

function loadFixture(size: number): BenchProjectData {
  const file = new URL(`./fixtures/tasks-${size}.json`, import.meta.url);
  return JSON.parse(readFileSync(file, 'utf8')) as BenchProjectData;
}

/** 折りたたみなしでフラット化した表示順 ID を返す（アプリの flattenTree と同じ順序）。 */
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

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

function summarize(label: string, recordings: FrameRecording[]): InteractionStat {
  const frames = recordings.flatMap((recording) => recording.frames).filter((value) => Number.isFinite(value));
  const sorted = [...frames].sort((a, b) => a - b);
  const sum = frames.reduce((acc, value) => acc + value, 0);
  const longTasks = recordings.flatMap((recording) => recording.longTasks);
  const runs = recordings.length;
  const windowMsTotal = recordings.reduce((acc, recording) => acc + recording.durationMs, 0);

  return {
    label,
    runs,
    windowMsPerRun: Math.round((windowMsTotal / runs) * 100) / 100,
    framesPerRun: Math.round((frames.length / runs) * 10) / 10,
    frameMeanMs: frames.length ? Math.round((sum / frames.length) * 100) / 100 : 0,
    frameP50Ms: Math.round(percentile(sorted, 50) * 100) / 100,
    frameP95Ms: Math.round(percentile(sorted, 95) * 100) / 100,
    frameMaxMs: Math.round((sorted[sorted.length - 1] ?? 0) * 100) / 100,
    over33ms: frames.filter((value) => value > 33.4).length,
    over50ms: frames.filter((value) => value > 50).length,
    longTasksPerRun: Math.round((longTasks.length / runs) * 10) / 10,
    longTaskTotalMsPerRun: Math.round((longTasks.reduce((acc, value) => acc + value, 0) / runs) * 100) / 100,
    longestTaskMs: Math.round((longTasks.length ? Math.max(...longTasks) : 0) * 100) / 100,
  };
}

/** ipcRenderer スタブとフレーム計測器をページへ事前注入する。 */
async function installHarness(page: import('@playwright/test').Page, projectJson: string) {
  await page.addInitScript((json: string) => {
    const w = window as unknown as {
      __perf: {
        start: () => void;
        stop: () => { frames: number[]; longTasks: number[]; durationMs: number };
      };
      ipcRenderer: {
        invoke: (channel: string) => Promise<unknown>;
        send: () => void;
        on: () => () => void;
      };
    };

    let frames: number[] = [];
    let longTasks: number[] = [];
    let recording = false;
    let lastTimestamp = 0;
    let startedAt = 0;

    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        longTasks.push(entry.duration);
      }
    });
    try {
      observer.observe({ type: 'longtask', buffered: false });
    } catch {
      /* longtask 非対応環境では無視 */
    }

    const loop = (timestamp: number) => {
      if (!recording) return;
      if (lastTimestamp) frames.push(timestamp - lastTimestamp);
      lastTimestamp = timestamp;
      requestAnimationFrame(loop);
    };

    w.__perf = {
      start() {
        frames = [];
        longTasks = [];
        lastTimestamp = 0;
        startedAt = performance.now();
        recording = true;
        requestAnimationFrame((timestamp) => {
          if (!recording) return;
          lastTimestamp = timestamp;
          requestAnimationFrame(loop);
        });
      },
      stop() {
        recording = false;
        return {
          frames: frames.slice(),
          longTasks: longTasks.slice(),
          durationMs: performance.now() - startedAt,
        };
      },
    };

    w.ipcRenderer = {
      invoke: async (channel: string) => (channel === 'load-file' ? json : null),
      send: () => {},
      on: () => () => {},
    };
  }, projectJson);
}

async function recordOnce(
  page: import('@playwright/test').Page,
  action: () => Promise<void>
): Promise<FrameRecording> {
  await page.evaluate(() => (window as unknown as PerfWindow).__perf?.start());
  await action();
  // 最後のイベントのコミットを計測窓に含めるための短い待機
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 120)));
  return page.evaluate(() => {
    const harness = (window as unknown as PerfWindow).__perf;
    return harness ? harness.stop() : { frames: [], longTasks: [], durationMs: 0 };
  });
}

async function recordRepeated(
  page: import('@playwright/test').Page,
  times: number,
  action: () => Promise<void>
): Promise<FrameRecording[]> {
  const recordings: FrameRecording[] = [];
  for (let i = 0; i < times; i += 1) {
    recordings.push(await recordOnce(page, action));
  }
  return recordings;
}

test.describe('描画性能ベンチマーク (P1 Step 0)', () => {
  const results: Record<string, { tasks: number; loadMs: number; dom: Record<string, number>; interactions: InteractionStat[] }> = {};

  for (const size of SIZES) {
    test(`1) ${size} タスク: 計測`, async ({ page }) => {
      const data = loadFixture(size);
      const orderedIds = flattenIds(data);
      const taskCount = Object.keys(data.tasks).length;
      expect(orderedIds.length).toBe(taskCount);

      // 画面上部（行インデックス 24 未満）に収まり、かつ今日に最も近いリーフを操作対象にする。
      const today = new Date();
      const todayMs = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
      let targetId = '';
      let targetIndex = -1;
      let bestDelta = Number.POSITIVE_INFINITY;
      orderedIds.forEach((id, index) => {
        const task = data.tasks[id];
        if (!task || task.children.length > 0 || !task.startDate) return;
        if (index >= 24) return;
        const delta = Math.abs(new Date(task.startDate).getTime() - todayMs);
        if (delta < bestDelta) {
          bestDelta = delta;
          targetId = id;
          targetIndex = index;
        }
      });
      expect(targetId).not.toBe('');
      expect(targetIndex).toBeGreaterThanOrEqual(0);

      await installHarness(page, JSON.stringify(data));
      await page.setViewportSize(VIEWPORT);
      await page.goto('/');

      // ── 読み込み（実インポート経路） ─────────────────────────────────────
      const loadStart = Date.now();
      await page.getByRole('button', { name: '読み込み' }).click();
      await expect(page.locator('input[data-field="title"]')).toHaveCount(taskCount, { timeout: 120_000 });
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve(null))));
      await page.waitForTimeout(500);
      const loadMs = Date.now() - loadStart;

      const dom = await page.evaluate(() => ({
        rows: document.querySelectorAll('.gantt-row-optimized').length,
        titleInputs: document.querySelectorAll('input[data-field="title"]').length,
        dependencyPaths: document.querySelectorAll('svg.absolute.inset-0 > path').length,
        totalNodes: document.querySelectorAll('*').length,
      }));

      const outlinerWidth = await page.evaluate(() => {
        const panel = document.querySelector('.gantt-row-optimized > div');
        return panel ? Math.round(panel.getBoundingClientRect().width) : 0;
      });

      const interactions: InteractionStat[] = [];

      // ── (c) 行ホバー ─────────────────────────────────────────────────────
      const firstRowBox = await page.locator('.gantt-row-optimized').first().boundingBox();
      expect(firstRowBox).not.toBeNull();
      const hoverX = Math.min(outlinerWidth + 240, (firstRowBox?.x ?? 0) + (firstRowBox?.width ?? 0) - 20);
      const hoverY = (row: number) => (firstRowBox?.y ?? 0) + row * 32 + 16;

      // ウォームアップ（JIT / 初回レイアウトを計測から除外）
      for (let i = 0; i < 6; i += 1) {
        await page.mouse.move(hoverX, hoverY(i + 1), { steps: 1 });
      }

      interactions.push(
        summarize(
          'hover(20 rows)',
          await recordRepeated(page, REPEAT_READ_ONLY, async () => {
            for (let row = 1; row <= 20; row += 1) {
              await page.mouse.move(hoverX, hoverY(row), { steps: 1 });
            }
          })
        )
      );

      // ── (a) ガントバーのドラッグ / (d) 依存ハンドルのドラッグ ────────────
      // 直前のドラッグで予定日が動くとバーの位置も動くため、各計測の直前に
      // 対象バーをスクロールで可視位置へ入れ直してから中心座標を取得する。
      // （座標が画面外だと mouse.down がバーに当たらず、ドラッグが始まらない）
      const barLocator = page.locator(`div[data-task-id="${targetId}"][data-gantt-bar]`);

      const moveToBarCenter = async () => {
        await barLocator.scrollIntoViewIfNeeded();
        const box = await barLocator.boundingBox();
        if (!box) return null;
        const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
        await page.mouse.move(point.x, point.y);
        return point;
      };

      const readTargetTitle = () =>
        page.evaluate(
          (id: string) =>
            (document.querySelector(`div[data-task-id="${id}"][data-gantt-bar]`) as HTMLElement | null)?.title ?? null,
          targetId
        );

      // ドラッグが実際に始まったか（= バーがドラッグ状態になったか）を記録する。
      const failedDragStarts: string[] = [];
      const failedSyntheticMoves: string[] = [];
      const assertDragging = async (label: string) => {
        const dragging = await page.evaluate(() => document.querySelectorAll('.cursor-grabbing').length);
        if (dragging === 0) failedDragStarts.push(label);
      };
      const initialTitle = await readTargetTitle();

      // (a) ドラッグ全体（30 moves + mouseup での確定コミット）
      const dragRecordings: FrameRecording[] = [];
      for (let i = 0; i < REPEAT_READ_ONLY; i += 1) {
        const point = await moveToBarCenter();
        if (!point) break;
        dragRecordings.push(
          await recordOnce(page, async () => {
            await page.mouse.down();
            await assertDragging('drag bar (30 moves)');
            for (let step = 1; step <= 30; step += 1) {
              await page.mouse.move(point.x + step * 4, point.y, { steps: 1 });
            }
            await page.mouse.up();
          })
        );
        await page.waitForTimeout(150);
      }
      if (dragRecordings.length) {
        interactions.push(summarize('drag bar (30 moves)', dragRecordings));
      }

      // (a') ドラッグ中の mousemove のみ（確定コミットを除外）をページ内合成イベントで計測
      // Playwright の page.mouse.move は 1 move ごとに CDP 往復が入るため、
      // 30 moves の大半がプロトコル待ちになりアプリ側の差（Step 2 / P2 の依存線再計算）
      // が埋もれる。ここではページ内で合成 mousemove を送出し、React の再描画が
      // 挟まるよう毎回 macrotask を 1 つ進めて、アプリ側コストだけを測る。
      const syntheticRecordings: FrameRecording[] = [];
      for (let i = 0; i < REPEAT_SYNTHETIC; i += 1) {
        const point = await moveToBarCenter();
        if (!point) break;
        await page.mouse.down();
        await assertDragging('drag mousemove only (in-page)');
        const leftBefore = await barLocator.evaluate((el) => (el as HTMLElement).style.left);
        await page.evaluate(() => (window as unknown as PerfWindow).__perf?.start());
        const elapsed = await page.evaluate(
          async ({ startX, clientY, moves }) => {
            const t0 = performance.now();
            for (let step = 1; step <= moves; step += 1) {
              window.dispatchEvent(
                new MouseEvent('mousemove', { clientX: startX + step * 4, clientY, bubbles: true })
              );
              // React の再描画（concurrent root は macrotask でスケジュールされる）を挟む
              await new Promise((resolve) => setTimeout(resolve, 0));
            }
            return performance.now() - t0;
          },
          { startX: point.x, clientY: point.y, moves: 30 }
        );
        const leftAfter = await barLocator.evaluate((el) => (el as HTMLElement).style.left);
        if (leftBefore === leftAfter) {
          failedSyntheticMoves.push(`run ${i}: left=${leftAfter}`);
        }
        const rec = await page.evaluate(() => {
          const harness = (window as unknown as PerfWindow).__perf;
          return harness ? harness.stop() : { frames: [], longTasks: [], durationMs: 0 };
        });
        syntheticRecordings.push({ ...rec, durationMs: Math.round(elapsed * 100) / 100 });
        // 確定（mouseup）は計測窓の外で行う
        await page.mouse.up();
        await page.waitForTimeout(150);
      }
      if (syntheticRecordings.length) {
        interactions.push(summarize('drag mousemove only (30 moves, in-page)', syntheticRecordings));
      }

      // (a'') ドラッグ確定（mouseup のコミット）のみ
      const commitRecordings: FrameRecording[] = [];
      for (let i = 0; i < REPEAT_READ_ONLY; i += 1) {
        const point = await moveToBarCenter();
        if (!point) break;
        await page.mouse.down();
        await assertDragging('drag commit (mouseup)');
        await page.mouse.move(point.x + 40, point.y, { steps: 1 });
        commitRecordings.push(await recordOnce(page, async () => { await page.mouse.up(); }));
        await page.waitForTimeout(150);
      }
      if (commitRecordings.length) {
        interactions.push(summarize('drag commit (mouseup)', commitRecordings));
      }

      // バーが実際にドラッグされ、確定で予定日が動いたことを検証する
      expect(failedDragStarts, `ドラッグが始まらなかった計測: ${failedDragStarts.join(', ')}`).toEqual([]);
      expect(failedSyntheticMoves, `合成 mousemove がバーを動かさなかった: ${failedSyntheticMoves.join(', ')}`).toEqual([]);
      expect(await readTargetTitle()).not.toBe(initialTitle);

      // ── (d) 依存ハンドルのドラッグ（setMousePos のファンアウト） ─────────
      const handleBox = await barLocator.locator('div[title="Drag to create dependency"]').boundingBox();
      if (handleBox) {
        const handleX = handleBox.x + handleBox.width / 2;
        const handleY = handleBox.y + handleBox.height / 2;
        interactions.push(
          summarize(
            'dependency-drag mousemove (setMousePos fan-out)',
            await recordRepeated(page, REPEAT_READ_ONLY, async () => {
              await page.mouse.move(handleX, handleY);
              await page.mouse.down();
              for (let step = 1; step <= 30; step += 1) {
                // 同一行内で水平移動のみ（行ホバーの再発火を避け、setMousePos の
                // 通知ファンアウトだけを分離して観測する）
                await page.mouse.move(handleX + step * 5, handleY, { steps: 1 });
              }
              // 同一タスク上で離す（依存は追加されない）
              await page.mouse.move(handleX, handleY, { steps: 1 });
              await page.mouse.up();
            })
          )
        );
      }

      // ── (b) duration セルへの文字入力 + 確定 ─────────────────────────────
      // Step 1 以降は入力中にストアを更新しないため、Enter による確定までを
      // 1 つの計測窓に含めて「編集 + 確定」のコストを比較する。
      const durationCell = page.locator('.gantt-row-optimized').nth(targetIndex).locator('input[data-field="duration"]');
      await durationCell.scrollIntoViewIfNeeded();
      await durationCell.click();
      await page.keyboard.press('ControlOrMeta+a');
      interactions.push(
        summarize(
          'duration type(3) + Enter commit',
          [
            await recordOnce(page, async () => {
              await page.keyboard.type('123', { delay: 25 });
              await page.keyboard.press('Enter');
            }),
          ]
        )
      );

      // ── (b) タイトル確定（Enter → 新規タスク追加） ───────────────────────
      const titleCell = page.locator('.gantt-row-optimized').nth(targetIndex).locator('input[data-field="title"]');
      await titleCell.click();
      await page.keyboard.press('ControlOrMeta+a');
      await page.keyboard.type(`${size}perf`);
      interactions.push(
        summarize(
          'title commit (Enter)',
          [
            await recordOnce(page, async () => {
              await page.keyboard.press('Enter');
            }),
          ]
        )
      );

      results[String(size)] = { tasks: taskCount, loadMs, dom, interactions };

      for (const stat of interactions) {
        console.log(
          `[bench ${size}] ${stat.label}: window/run=${stat.windowMsPerRun}ms ` +
            `longTasks/run=${stat.longTasksPerRun} (${stat.longTaskTotalMsPerRun}ms, longest=${stat.longestTaskMs}ms) ` +
            `frameMax=${stat.frameMaxMs}ms over50ms=${stat.over50ms}`
        );
      }
    });
  }

  test.afterAll(() => {
    const resultsDir = new URL('./results/', import.meta.url);
    mkdirSync(resultsDir, { recursive: true });
    const output = {
      generatedAt: new Date().toISOString(),
      viewport: VIEWPORT,
      sizes: Object.keys(results).map(Number),
      results,
    };
    writeFileSync(new URL('step0.json', resultsDir), JSON.stringify(output, null, 2), 'utf8');
    console.log(`BENCH_RESULTS ${JSON.stringify(output)}`);
  });
});
