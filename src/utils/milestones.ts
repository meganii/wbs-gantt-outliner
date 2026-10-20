import type { Milestone } from '../types';
import { parseIsoDateStrict } from './date';

const DEFAULT_MILESTONE_TITLE = 'マイルストーン';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 日付順（同日ならタイトル順）に並べる。並び順は表示専用で、保存順は問わない。 */
export function sortMilestones(milestones: Milestone[]): Milestone[] {
  return [...milestones].sort((a, b) => {
    if (a.date !== b.date) {
      return a.date.localeCompare(b.date);
    }
    return a.title.localeCompare(b.title, 'ja');
  });
}

function uniqueId(base: string, seen: Set<string>): string {
  if (!seen.has(base)) {
    seen.add(base);
    return base;
  }

  let suffix = 2;
  while (seen.has(`${base}-${suffix}`)) {
    suffix += 1;
  }
  const id = `${base}-${suffix}`;
  seen.add(id);
  return id;
}

/**
 * 読み込んだ未知の `milestones` を検証・正規化する。
 *
 * - 未設定（undefined / null）は空配列（警告なし）
 * - 配列でない場合は空配列＋警告
 * - 日付が不正な項目は除外
 * - ID の欠損・重複は `milestone-N` で補完
 * - タイトルが空なら「マイルストーン」に補完
 *
 * タスクの日程計算には影響しないため、修復は「読める形に直す」方針に留める。
 */
export function normalizeMilestones(
  raw: unknown,
  warnings: string[] = []
): Milestone[] {
  if (raw === undefined || raw === null) {
    return [];
  }

  if (!Array.isArray(raw)) {
    warnings.push('マイルストーン設定(milestones)が不正なため無視しました');
    return [];
  }

  const seenIds = new Set<string>();
  const normalized: Milestone[] = [];
  let dropped = 0;
  let repairedIds = 0;
  let repairedTitles = 0;

  raw.forEach((item, index) => {
    if (!isRecord(item)) {
      dropped += 1;
      return;
    }

    const date = parseIsoDateStrict(item.date);
    if (!date) {
      dropped += 1;
      return;
    }

    const rawId = typeof item.id === 'string' ? item.id.trim() : '';
    const requestedId = rawId || `milestone-${index + 1}`;
    const id = uniqueId(requestedId, seenIds);
    if (id !== rawId) {
      repairedIds += 1;
    }

    const rawTitle = typeof item.title === 'string' ? item.title.trim() : '';
    if (!rawTitle) {
      repairedTitles += 1;
    }

    const rawNote = typeof item.note === 'string' ? item.note.trim() : '';
    const milestone: Milestone = {
      id,
      title: rawTitle || DEFAULT_MILESTONE_TITLE,
      date,
    };
    if (rawNote) {
      milestone.note = rawNote;
    }

    normalized.push(milestone);
  });

  if (dropped > 0) {
    warnings.push(`不正なマイルストーン ${dropped} 件を除外しました`);
  }
  if (repairedIds > 0) {
    warnings.push(`マイルストーンの ID 欠損・重複 ${repairedIds} 件を補完しました`);
  }
  if (repairedTitles > 0) {
    warnings.push(`マイルストーンのタイトル ${repairedTitles} 件を既定値に補完しました`);
  }

  return sortMilestones(normalized);
}

/**
 * マイルストーン群の最小・最大日付を epoch ms で返す。
 * タイムラインの表示範囲にマイルストーンを含めるために使う。
 */
export function getMilestoneDateRange(
  milestones: Milestone[]
): { minMs: number | null; maxMs: number | null } {
  let minMs: number | null = null;
  let maxMs: number | null = null;

  milestones.forEach((milestone) => {
    const date = parseIsoDateStrict(milestone.date);
    if (!date) {
      return;
    }
    const time = new Date(date).getTime();
    if (Number.isNaN(time)) {
      return;
    }
    if (minMs === null || time < minMs) {
      minMs = time;
    }
    if (maxMs === null || time > maxMs) {
      maxMs = time;
    }
  });

  return { minMs, maxMs };
}
