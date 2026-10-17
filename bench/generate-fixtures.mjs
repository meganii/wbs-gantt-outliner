/**
 * ベンチマーク用のサンプル JSON を生成する。
 *
 *   node bench/generate-fixtures.mjs
 *
 * `bench/fixtures/tasks-<N>.json` を上書き生成する。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { generateProjectData } from './generate-tasks.mjs';

const SIZES = [100, 1000];
const fixturesDir = new URL('./fixtures/', import.meta.url);
mkdirSync(fixturesDir, { recursive: true });

for (const size of SIZES) {
  const data = generateProjectData(size);
  const taskCount = Object.keys(data.tasks).length;
  const file = new URL(`tasks-${size}.json`, fixturesDir);
  writeFileSync(file, JSON.stringify(data), 'utf8');

  const leaves = Object.values(data.tasks).filter((task) => task.children.length === 0).length;
  const dependencies = Object.values(data.tasks).reduce(
    (sum, task) => sum + task.dependencies.length,
    0
  );
  console.log(
    `tasks-${size}.json: ${taskCount} tasks (${leaves} leaves, ${dependencies} deps)`
  );
}
