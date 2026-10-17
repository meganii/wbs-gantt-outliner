/**
 * クリップボードの複数行テキストを、一括登録用のタスク行へ変換する純粋関数。
 *
 * 対応する入力:
 * - プレーンテキストの複数行（行頭のタブ/スペースで階層化）
 * - Excel 等のタブ区切り（1 列目のみをタスク名として採用。以降の列は読み捨て）
 *
 * 「タブが列区切りか、行頭インデントか」は行の形で自動判定する。
 * 内容の後ろにタブが現れる行があれば Excel（列）モード、
 * 行頭のタブ/スペースだけならプレーンテキストモードとして扱う。
 */

export interface ParsedPasteLine {
  /** タスク名（前後の空白は除去済み）。 */
  title: string;
  /** 階層の深さ。先頭行を基準（0）とした相対値。 */
  depth: number;
}

/** タブ 1 個ぶんのインデント幅（スペース換算）。 */
const TAB_WIDTH = 4;

/** 行頭の空白（タブ/スペース）をスペース幅に換算する。 */
function measureIndent(leading: string): number {
  let width = 0;
  for (const ch of leading) {
    width += ch === '\t' ? TAB_WIDTH : 1;
  }
  return width;
}

export function parseTaskPaste(text: string): ParsedPasteLine[] {
  if (!text) {
    return [];
  }

  const rawLines = text.split(/\r\n|\n|\r/);

  // 内容の後ろにタブを含む行があればタブ区切り（Excel）モード。
  // 行頭タブだけの行（インデント）はモード判定に影響させない。
  const isColumnMode = rawLines.some((line) => /\S.*\t/.test(line));

  const entries: Array<{ title: string; indent: number }> = [];

  for (const raw of rawLines) {
    if (raw.trim() === '') {
      // 空白のみの行はタスクを作らない
      continue;
    }

    const leadingMatch = isColumnMode ? raw.match(/^ */) : raw.match(/^[ \t]*/);
    const leading = leadingMatch ? leadingMatch[0] : '';
    const rest = raw.slice(leading.length);

    // 列モードでは、行頭のスペース（=インデント）を取り除いた残りをタブで分割し、
    // 最初のセルだけをタスク名に採用する。タブは列区切り、インデントはスペースで表現する。
    const title = (isColumnMode ? (rest.split('\t')[0] ?? '') : rest).trim();
    if (title === '') {
      continue;
    }

    entries.push({ title, indent: measureIndent(leading) });
  }

  if (entries.length === 0) {
    return [];
  }

  // 実際に現れたインデント幅を小さい順に並べ、その順位を深さとする。
  // インデント単位がスペース 2/4 個でもタブでも同じ結果になる。
  const uniqueIndents = Array.from(new Set(entries.map((entry) => entry.indent))).sort(
    (a, b) => a - b
  );
  const depthByIndent = new Map(uniqueIndents.map((indent, index) => [indent, index]));

  return entries.map((entry) => ({
    title: entry.title,
    depth: depthByIndent.get(entry.indent) ?? 0,
  }));
}
