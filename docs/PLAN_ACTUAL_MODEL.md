# 予定・実績モデル設計提案（Plan / Actual Model Proposal）

Status: **提案（未実装）** / Date: 2026-10-18

このドキュメントは「予定 / 実績」の使い分けが直感的でないという課題に対して、Oracle Primavera P6 と Microsoft Project の用語・実装を調査し、本アプリのモデルと UI をどう整理するかを提案するものです。実装はまだ行っていません。

---

## 0. 結論（サマリ）

- P6 / MS Project はいずれも **3 層構造**で管理する。 **基準計画（不変スナップショット）/ 予定（現在の見込み）/ 実績（事実）** であり、「予定と実績を双方向同期する」ツールは存在しない。ここで言う「双方向同期」とは、**予定を編集すると実績側へ、実績を編集すると予定側へ、同じ値を自動でコピーし合う**本アプリ現行の挙動を指す（具体例は §4.1）。
- 本アプリがしっくり来ない根源は 3 点:
  1. **「予定」が 2 役を兼ねている** — 基準計画（当初計画）と現在の予定（見込み）を同じ `plan*` フィールドで表現し、「基準計画固定」トグルで意味が反転する。
  2. **「実績」フィールド（`startDate`/`endDate`）が実務上は「現在の予定」として使われている** — 既定（ロック OFF）では `plan*` とミラーされ常に同値。実績を入力すると予定も動いてしまい、遅れを記録できない。
  3. **基準計画スナップショットが存在しない** — 「固定」した時点の値が実質ベースラインだが、明示的な登録操作・比較表示・差異算出がない。
- 提案の骨子:
  - 用語を **基準計画 / 予定（見込み）/ 実績 / 残り期間 / 進捗基準日** に整理する。
  - **`plan` ＝ 予定（見込み、編集可・依存伝播の対象）**、**`startDate`/`endDate` ＝ 実績開始日/実績終了日**、**`baseline`（新規）＝ 基準計画（不変）** とする。
  - **双方向同期を廃止**し、「基準計画固定」トグルを **「基準計画として登録」** 操作に置き換える。
  - 期間の関係は MS Project と同じ **予定期間（= Duration）= 実績期間（Actual Duration）+ 残り期間（Remaining Duration）**、**進捗率 = 実績期間 ÷ 予定期間**。
  - 実績入力は「予定（見込み）」を動かすが、**基準計画は動かない**。基準計画を書き換えるのは、承認済み計画そのものが変わったときの明示的な再登録（再ベースライン）だけであり、通常のリスケジュールでは触らない（§5.8）。

---

## 1. 調査: Microsoft Project

### 1.1 用語（日本語 UI / 英語フィールド）

| 日本語 | 英語フィールド | 意味 |
| --- | --- | --- |
| 開始日 / 終了日 | Start / Finish（Scheduled） | **現在の予定（見込み）** 。着工後は実績開始日が Start になる。常に最新の見通しを表す |
| 実績開始日 / 実績終了日 | Actual Start / Actual Finish | 実際に開始/完了した日。完了までは実績終了日は空（NA） |
| 期間 | Duration | **実績期間 + 残り期間**（総期間 = At Completion 相当） |
| 実績期間 | Actual Duration | 実績開始日〜（実績終了日 or 基準日）の稼働期間 |
| 残り期間 | Remaining Duration | 残作業に必要な期間 |
| % 完了 | % Complete | 期間ベースの進捗率。`実績期間 ÷ 期間 × 100` |
| 基準開始日 / 基準終了日 | Baseline Start / Finish | **基準設定時にスナップショットされた当初計画**。以後不変 |
| 基準期間 | Baseline Duration | 基準設定時の期間 |
| 基準日 | Status Date | 進捗をどこまで記録したかの基準日。過去日（週次締め）も指定可 |
| 差異 | Start/Finish/Duration Variance | 基準 − 現在（予定/実績）の差 |

### 1.2 実装・挙動の要点

- **期間の関係**: `期間 = 残り期間 + 実績期間`、`% 完了 = 実績期間 ÷ 期間 × 100`。`% 完了` を入力すると実績期間と残り期間が再計算される。残り期間を入力すると期間と % 完了が再計算される（出典: [Update work on a project](https://support.microsoft.com/en-us/project/update-work-on-a-project)）。
- **実績入力の自動規則**: `% 完了 > 0` を入力すると、実績開始日が未入力なら**予定開始日が実績開始日として自動設定**される。`100%` を入力すると実績終了日が予定終了日で自動設定される（出典: [Percent (%) Complete fields](https://support.microsoft.com/en-us/project/percent-complete-fields)）。
- **実績・予定・基準の関係（最重要）**: 「実績開始日/実績終了日を入力すると、そのタスクの**予定（Scheduled）日付は変わるが、基準（Baseline）日付は影響を受けない**」（出典: [Update work on a project](https://support.microsoft.com/en-us/project/update-work-on-a-project)）。つまり **予定は動き、基準計画は動かない**。
- **基準設定**: 「基準の設定」操作で、その時点の予定フィールドを基準フィールドへコピーする。基準 0〜10 の 11 本まで保持できる。基準未設定の基準フィールドは "NA"（出典: [Baseline Start fields](https://support.microsoft.com/en-us/project/baseline-start-fields)）。
- **基準の更新（再ベースライン）**: 基準は「基準の設定」で上書き更新でき、`Baseline1`〜`Baseline10` へ別枠保存することも、選択タスクだけを更新することもできる。計画変更が起きたときは「既存を上書き更新するより、2 つ目の基準や暫定計画を保存する方が有用」とされている。**暫定計画**（現在の開始/終了を Start1〜10 / Finish1〜10 へコピーする仕組み）なら、基準計画を汚さずに比較用スナップショットを残せる（出典: [Create or update a baseline or an interim plan in Project desktop](https://support.microsoft.com/en-us/project/create-or-update-a-baseline-or-an-interim-plan-in-project-desktop)）。
- **再スケジュール**: 「未完了作業を再スケジュールする」で残作業を基準日以降へ移動する。実績（過去）は移動しない（出典: 同上 / [Set the start date or finish date](https://support.microsoft.com/en-us/project/set-the-start-date-or-finish-date-for-your-project-in-project-desktop)）。
- **比較の見方**: 進捗の確認は Work/Variance テーブル（`差異 = 基準 − 予定/実績`）と Tracking Gantt（基準バー＋現行バー＋%完了の塗り）で行う（出典: [Review the progress of your schedule](https://support.microsoft.com/en-us/project/review-the-progress-of-your-schedule)）。

### 1.3 表示

- Tracking Gantt は「現行バー（進捗分を濃色で塗る）」＋「基準バー（グレー、下段の細いバー）」の 2 本構成。実績専用バーは描かない（進捗塗りが実績の表現を兼ねる）。
- 差異テーブルで開始差異 / 終了差異 / 期間差異を数値でも確認できる。

---

## 2. 調査: Primavera P6

### 2.1 用語

| 日本語 | 英語フィールド | 意味 |
| --- | --- | --- |
| 開始 / 終了 | Start / Finish | 現在の日程。着工後は実績開始、完了後は実績終了。未着工は残り早期日程（＝現在の見込み） |
| 実績開始 / 実績終了 | Actual Start / Actual Finish | 実績。スケジューラは一度適用した実績を変更しない |
| 予定開始 / 予定終了 | Planned Start / Finish | 当初の予定。未着工のうちは再スケジュールで更新され、**実績開始を適用した時点で凍結**される |
| 残り開始 / 残り終了 | Remaining Start / Finish | データ日以降の残作業の日程。着工後は残り開始 = データ日、完了後は空 |
| データ日 | Data Date | MS Project の基準日に相当。ここまでが実績、ここから先が見込み |
| 予定期間 | Planned Duration | 当初予定の期間 |
| 実績期間 | Actual Duration | 実績開始日 〜（実績終了日 or データ日） |
| 残り期間 | Remaining Duration | 残作業に必要な期間 |
| 完了時期間 | At Completion Duration | **実績期間 + 残り期間** |
| 進捗率 | Activity % Complete | 進捗タイプ（Duration / Units / Physical）に従う |
| 基準計画 | Baseline | **プロジェクトのコピー**として保持。最大 3 本（Primary/Secondary/Tertiary）＋プロジェクト基準計画 |
| BL フィールド | BL Start / BL Finish / BL Duration など | 基準計画側の値を比較用に表示するフィールド |

### 2.2 実装・挙動の要点

- **予定の凍結**: 「活動が未着工の間、予定開始/終了は再スケジュールのたびに再計算される。実績開始を適用すると、予定日付は固定されスケジューラに再計算されなくなる」（出典: [Planned Dates](https://docs.oracle.com/cd/F51301_01/English/User_Guides/p6_eppm_user/98348.htm)）。＝ **予定は「当初計画」として着工時に凍結される**。
- **進捗率（Duration タイプ）**: `進捗率 = (予定期間 − 残り期間) ÷ 予定期間 × 100`。進捗率を入力すると P6 が残り期間を逆算する。常に 0〜100 に収まる（出典: [Define activity percent complete types](https://docs.oracle.com/cd/F88968_01/English/User_Guides/p6_pro_user/define_activity_percent_complete_types.htm)）。
- **予定進捗率（Schedule % Complete）**: `(データ日 − BL開始) ÷ (BL終了 − BL開始)`。**「予定どおりなら今これくらい進んでいるべき」**を示す時間ベースの指標で、実績進捗率とは別物（出典: [Percent Complete Columns](https://docs.oracle.com/cd/F51301_01/p6help/en/47228.htm)）。
- **基準計画の運用**: 基準計画はプロジェクトのコピーとして保持され、更新（進捗入力）しても**基準側の値は変わらない**。ガントでは「現行バー / 予定バー / 実績バー / 残りバー / 基準バー」を使い分けて重ねて表示できる（出典: [バーの種類](https://docs.oracle.com/cd/G18296_01/client_help/ar_EG/more_detail_specifying_a_bars_timescale.htm)、[Schedule Baselines in Primavera P6](https://tensix.com/schedule-baselines-in-primavera-p6)）。
- **基準計画の更新（再ベースライン）**: 「ベースラインの管理（Maintain Baselines）」から、基準計画を最新データで**上書き更新**できる（全活動 or フィルタ条件で範囲選択、追加/削除/更新を選択、最終更新日を記録）（出典: [Update a baseline](https://docs.oracle.com/cd/G48902_01/English/User_Guides/p6_pro_user/update_a_baseline.htm)）。実務では**承認済みの初回計画は上書きせず、再ベースラインは別の基準計画（B1, B2 …）として追加保存**し、ユーザーベースライン（Primary/Secondary/Tertiary）を気軽なスナップショットに使うのが推奨（出典: [Working with Baselines](https://docs.oracle.com/cd/F51301_01/p6help/en/6687.htm)、[OnePager](https://www.onepager.com/tips/primavera-p6/p6-baseline.html)）。
- **進捗ライン**: 基準との開始/終了日の差異、または残り期間/%完了のプロットをガントに横断表示できる（出典: [Apply a Progress Line](https://docs.oracle.com/cd/F37128_01/client_help/en_US/applying_a_progress_line_to_the_gantt_chart.htm)）。

---

## 3. 両ツールに共通する設計原則

1. **3 層構造**: 基準計画（凍結スナップショット）/ 予定（現在の見込み）/ 実績（事実）。予定と実績は**別の役割**であり、相互同期しない。
2. **期間の等式**: `総期間 = 実績期間 + 残り期間`。進捗率はこの等式から導出される（入力も可、入力時は残り期間を再計算）。
3. **基準日（データ日）が実績と見込みの境界**。実績期間の終端は「実績終了日」または「基準日」。
4. **基準計画は通常運用で不変**。取得は明示操作（「基準の設定」/ベースライン割り当て）で行い、以後の進捗入力やリスケジュールでは動かない。変更は明示的な**再ベースライン操作**（上書き更新 / 別枠追加）だけ（§5.8）。
5. **実績入力は予定（見込み）を動かす。基準計画は動かさない。**
6. **比較表示**は「主バー（進捗塗り）＋基準バー（グレー）」と差異列。予定進捗率（時間ベース）と実績進捗率の対比で遅れを可視化する。

本アプリが採用しない（＝スコープ外とする）概念: 工数・コスト（Work / Units / EVM）、複数基準計画、フロート/クリティカルパス、制約条件（Must Start On 等）、タスク分割（Split）、期間別実績の蓄積（Store Period Performance）。

---

## 4. 現状実装の整理と課題

### 4.1 現状のフィールドと挙動

| 現行フィールド | 現状の意味（コード上のコメント） | 実態 |
| --- | --- | --- |
| `planStartDate` / `planEndDate` / `planDuration` | "Plan / Baseline"（`src/types.ts` L16-18） | ロック OFF では `startDate` 等とミラー。ロック ON では「凍結した当初計画」＝実質ベースライン |
| `startDate` / `endDate` / `duration` | コメント上は実績。UI では「実績日付 / 実績期間」 | ロック OFF では「現在の予定」として使われる。ロック ON で初めて「実績・見込」の意味になる |
| `progress` | 0-100 の独立フィールド | 期間・実績日付と無関係に手入力される |
| `baselineLocked` | 「基準計画固定」トグル | 意味がロックの有無で反転するモードフラグ |

- `updateTask` / `endDragUpdate` はロック OFF 時に `plan*` ⇄ `startDate` 等を双方向ミラーする（`src/store/useTaskStore.ts` L331-359 / L392-420）。
- ロック OFF では実績バーを描画せず、予定バーが実績日付へフォールバックする。ロック ON で初めて 2 本目の実績バーが出る（`src/components/GanttTimelineRow.tsx` L113-118, L277）。
- ロック ON では WBS の予定列を描画から外す（`src/components/Outliner.tsx` L52-60）。
- 依存伝播・親ロールアップは `plan*` を常に書き換え、`startDate` 等はロック OFF のときだけ同時に書き換える（`src/store/taskStoreUtils.ts` L152-160, L244-257, L461-486）。

**「双方向同期」の具体例**: 予定 9/1〜9/5（期間 5 営業日）のタスクの実績開始日セルに `9/3` と入力すると、(a) 実績開始日が 9/3 になり、(b) 同じ値が予定開始日にもコピーされ、(c) 予定期間から予定終了日が再計算されて予定は 9/3〜9/9 になる。結果として **「2 日遅れて開始した」という事実も、当初予定 9/1〜9/5 との差異もどこにも残らない**。逆方向では、ガントで予定バーを動かすと実績日付も同じ値で書き換わるため、実績が未来日になることがある。P6 / MS Project にはこのような相互コピーは存在せず、実績は実績フィールドにのみ入り、予定（見込み）が動くだけである。

### 4.2 課題（なぜしっくり来ないのか）

1. **意味の二重化**: 「予定」＝基準計画なのか現在の見込みなのかが、トグルの状態で変わる。ユーザーは常に「今どちらの世界か」を意識する必要がある。
2. **実績を記録できない**: ロック OFF では実績日付を入力すると予定日付も同じ値に書き換わるため、「2 日遅れて開始した」という事実を入力すると、遅れが消えてしまう。実績の主目的（事実の記録）が成立しない。
3. **必須の二重入力**: ロック ON では予定と実績を別々に維持する必要があるが、実績から見込みが自動更新されないため、更新のたびに両方を手で直す。片方を忘れると破綻する。
4. **進捗と期間の非連動**: `progress` は独立値で、`duration` や残りと整合しない。「進捗 50% なのに実績期間 1 日」のような状態を作れてしまう。
5. **「固定」が固定になっていない**: ロック ON でも、依存伝播・親ロールアップは `plan*`（＝予定）を書き換え続ける（人が触れないだけ）。「基準計画固定」という名前から期待される「当初計画の保存」にはなっていない。
6. **比較ができない**: 基準計画が独立していないため、「当初計画に対してどうずれたか（差異）」を後から出せない。
7. **表示モードで UI が反転する**: ロック ON/OFF で列の表示・バーの本数・依存線のアンカー・ドラッグ対象がすべて入れ替わり、覚えることが多い。

---

## 5. 提案モデル

### 5.1 用語（このアプリでの定義）

| 用語 | 定義 | 由来 |
| --- | --- | --- |
| **基準計画** | 承認時点の予定日付・期間のスナップショット。登録後は通常運用では不変（更新は明示的な再登録のみ。§5.8）。比較と差異の基準 | MS Project 基準 / P6 ベースライン |
| **予定** | 現在の計画・見込み（予定開始日 / 予定終了日 / 予定期間）。着工後は実績を踏まえて更新される「今の見通し」 | MS Project Start/Finish |
| **実績** | 実際に起きた事実（実績開始日 / 実績終了日）。完了するまで実績終了日は空 | 両者共通 |
| **実績期間** | 実績開始日〜（実績終了日 or 進捗基準日）の営業日数。**導出値** | MS Actual Duration / P6 Actual Duration |
| **残り期間** | 残作業に必要な営業日数。入力も、進捗率からの逆算も可 | MS Remaining / P6 Remaining Duration |
| **予定期間** | 総期間（見込み）。**実績期間 + 残り期間** と常に一致 | MS Duration / P6 At Completion Duration |
| **進捗率** | 期間ベース。**実績期間 ÷ 予定期間 × 100** | MS % Complete / P6 Duration % |
| **進捗基準日** | 実績をどこまで記録したかの基準日（既定 = 今日） | MS 基準日 / P6 データ日 |

> 用語の対比: 既存の「予定日付」「予定期間」という列名は維持できるが、**意味は「今の見込み」に統一**される。当初計画は「基準計画」列（読み取り専用）として別に表示する。

### 5.2 データモデル

| 概念 | フィールド | 備考 |
| --- | --- | --- |
| 予定 | `planStartDate` / `planEndDate` / `planDuration`（既存） | ガント編集・依存伝播・親ロールアップの**唯一の対象**。双方向同期は廃止 |
| 実績開始 / 実績終了 | `startDate` / `endDate`（既存、意味を固定） | 予定のミラーをやめ、事実のみを保持 |
| 実績期間 | `duration`（既存、導出値へ変更） | UI は読み取り専用。JSON 互換のためフィールドは残す |
| 残り期間 | `remainingDuration`（新規） | 着工後は `予定期間 − 実績期間` と連動 |
| 進捗率 | `progress`（既存） | 期間ベースで導出。入力時は残り期間を再計算 |
| 基準計画 | `baselineStartDate` / `baselineEndDate` / `baselineDuration`（新規） | 「基準計画を登録」でスナップショット。以後の通常運用では不変。更新時は旧基準を `previousBaseline*` へ 1 世代退避（§5.8） |
| 進捗基準日 | `projectConfig.statusDate`（新規、既定 `null` = 今日） | 週次締め運用をしたい場合のみ指定 |
| 基準計画のメタ | `projectConfig.baselineSetAt`（新規、任意） | 登録日時の表示用 |

`baselineLocked` は廃止（読み込み時に解釈して移行。§6 参照）。

### 5.3 計算規則（導出と入力の連動）

基本の等式（MS Project と同じ）:

```
予定期間（Duration） = 実績期間（Actual Duration） + 残り期間（Remaining Duration）
進捗率（% Complete）  = 実績期間 ÷ 予定期間 × 100（四捨五入）
実績期間            = 営業日数(実績開始日 〜 (実績終了日 or 進捗基準日))
```

入力操作ごとの連動:

| 入力 | 動作 |
| --- | --- |
| 予定開始日 / 予定終了日 / 予定期間（未着工） | 通常の計画編集。予定期間 = 予定終了 − 予定開始 + 1 営業日 |
| 予定期間（着工後） | 残り期間 = max(0, 予定期間 − 実績期間)。予定終了日 = 予定開始日 + 予定期間 − 1 営業日 |
| 残り期間（着工後） | 予定期間 = 実績期間 + 残り期間。予定終了日を再計算 |
| 進捗率 | 残り期間 = round(実績期間 × (1 − 進捗率) ÷ 進捗率)。予定期間・予定終了日を再計算 |
| 実績開始日 | 予定開始日 = 実績開始日。予定終了日 = 予定開始日 + 予定期間 − 1 営業日（後続へ依存伝播） |
| 実績終了日 | 進捗率 = 100、残り期間 = 0、予定終了日 = 実績終了日 |
| 進捗率 > 0 を未着工タスクへ入力 | MS Project と同じく実績開始日 = 予定開始日を自動設定してから再計算 |
| 予定バーのドラッグ / リサイズ | 常に予定のみを編集（実績・基準計画は不変） |

補足:
- 着工後の「予定」は常に「今の見込み」であり、当初計画は基準計画側に保存される（MS Project 流）。P6 流の「着工時に予定を凍結」は採用しない（基準計画が当初計画の保存役を担うため冗長）。
- 進捗率の分母は MS Project 式（実績 + 残り = 総期間）を採用する。P6 の Duration % は分母が「当初予定期間」で、入力時に残り期間を逆算する方式だが、本アプリでは導出の分かりやすさを優先する。

### 5.4 操作規則（いつ何を編集するか）

想定ワークフロー（「使い方」の提案）:

1. **計画時**: 予定だけを編集する（ガントのドラッグ / 予定列）。実績は空のまま。計画が固まったら **「基準計画として登録」** を 1 回押す。
2. **週次更新**: 進捗率（または残り期間、完了タスクは実績終了日）を入力する。実績開始日は着工時に 1 回入力（進捗率入力で自動設定も可）。**予定（見込み）は自動で右へずれて後続へ伝播する**。基準計画は動かない。
3. **レビュー**: 基準計画バー（グレー）と差異列で「当初計画に比べて何日ずれたか」を確認する。

留意点:
- **実績日付は事実なので、予定が右へずれても実績は書き換えない**（依存伝播の対象外）。
- **予定はいつでも編集可能**（ロックはしない）。当初計画との比較は基準計画が担うため、予定を直しても過去は失われない。
- **基準計画の登録は明示操作のみ**。通常のリスケジュールでは基準計画を触らない。承認済み計画が変わったときだけ「基準計画を更新」する（上書き・旧基準の退避・元に戻すの詳細は §5.8）。
- **Phase 1 の暫定規則（実装済み）**: 実績開始日が空のまま実績期間 / 実績終了日を入力した場合は、**予定開始日を実績開始日とみなす**（着工済みとして記録）。上表の「進捗率 > 0 を未着工タスクへ入力」と同じ発想。進捗率・残り期間が入る Phase 2 で規則を確定する。

### 5.5 ガント表示（操作は 1 本のバーに集約）

各行の**操作対象バーは 1 本だけ**にする（現行の「予定バー + 実績バー」の 2 本構成をやめる）。実績は「進捗の塗り」とツールチップで表現し、基準計画は**非操作の薄いバー**として裏側に置く（MS Project の Tracking Gantt と同じ考え方）。

| 要素 | 表示 | 役割 |
| --- | --- | --- |
| 予定バー（青・太） | 常時。行の中央 | **唯一の操作対象**。ドラッグ = 予定の移動 / 端 = リサイズ / `+` = 依存追加。左端から進捗分を濃色で塗る（塗り率 = 実績期間 ÷ 予定期間。着工後は予定開始 = 実績開始なので塗りは左端から始まる） |
| 基準計画バー（グレー・細） | 予定バーの少し下に薄く。`pointer-events: none` | 当初計画のゴースト。予定とのズレ（左端 = 開始遅れ、右端 = 終了の見込み/実績の差）を 1 目で読む |
| 実績マーカー（任意） | 予定バー上の実績開始日 / 実績終了日の細い縦線 | 実績日付を明示したいときだけ表示（オプション）。既定は塗り + ツールチップ |
| 差異 | ツールチップ（予定・実績・基準の日付と差異）や差異列 | 数値で確認したい場合（Phase 3） |

基準計画バーの置き方は **案 B（予定バーの下に数 px ずらして細く置く。MS Project 式）を採用**する（2026-10-18 決定）。

- 案 A（予定バーと完全に同じ位置の裏側）は差分がないとき最もクリーンだが、**基準計画が予定より短い場合に右端が予定バーへ隠れ、「当初はいつ終わる予定だったか」が読めない**ため不採用。
- 案 B は操作対象が 1 本のまま、開始・終了の両方のズレが常に読める。行内の高さ配分は「予定バー = 行の中央 / 基準計画バー = その下に数 px の細バー」とする。

実装状況（2026-10-18）: 予定バー 1 本 + 進捗塗り（`bg-brand-600`、幅 = `progress%`）+ 基準計画ゴースト（`bg-slate-300/80`、葉 `top-[19px] h-[5px]` / 親 `top-[20px] h-[4px]`、`pointer-events: none`）まで実装済み。実績マーカーは未実装（Phase 2 以降の任意要素）。親バーは進捗塗りを `bg-slate-500/70` にしている。

完了（`progress >= 100`）は枠と塗りを青から緑へ切り替え、色でも完了が分かるようにしている（葉 = `border-green-400 bg-green-100` + 塗り `bg-green-600`、親 = `border-green-500/60 bg-green-200/70` + 塗り `bg-green-500/80`）。色は WBS のステータス列（`TaskStatusCell` の「完了 = 緑」）に合わせた。緑になるのは塗りが 100% まで到達したときだけなので、ステータスだけ「完了」で進捗が 100% でないタスクは緑にならない（不整合がそのまま見える）。

状態ごとの見え方:

- 未着工: 予定バーのみ（塗りなし）。基準計画とのズレがあればグレーバーで見える。
- 進行中: 予定バー + 進捗塗り。残り区間は薄色のまま。
- 完了: 塗り 100%。基準計画の右端との差が「何日遅れて終わったか」を示す。
- 親タスク: 現行どおり細いバー + 下向きブラケット。基準計画は同じく下側に薄く。

2 本目のバー（実績専用バー）は**既定でもオプションでも持たない**。実績の期間を明示したくなったら、実績マーカー 2 本（開始 / 終了）で表現する。

実装上の注意（現行コードへの影響）:

- `GanttTimelineRow` の予定バー / 実績バーの 2 ブロックを 1 つに統合する。`taskBarRefs` は統合後のバー 1 本だけを指す（現行はロック時に実績バーへ差し替えている。依存線アンカーの切り替えも不要になる）。
- `data-gantt-bar` による行の `draw-range` との衝突防止（`stopPropagation`）は統合バーへ引き継ぐ。HANDOFF の D1 / D2 の注意事項はそのまま有効。
- 基準計画バーは `aria-hidden` + `pointer-events: none`。ドラッグ・依存追加・クリック判定に関与させない。
- 実績系のアンバーは「実績マーカー」と進捗塗りのアクセントに引き継ぐ（バーそのものは 1 本になる）。

### 5.6 親ロールアップと依存伝播

- **親ロールアップ**: 予定 = 子の最小開始〜最大終了、実績 = 子の実績の最小開始〜最大終了、進捗 = 期間加重平均（既存踏襲）。予定期間 = 子の予定のスパン。
- **依存伝播（FS）**: 後続の予定開始 = 先行の予定終了 + 1 営業日。後続の予定終了 = 予定開始 + 予定期間 − 1。**後続の実績日付は絶対に変更しない**（現行の「ロック OFF では実績も同時シフト」を廃止）。
- 先行が着工遅れで予定終了が右へずれた場合、後続の予定が連鎖して右へずれる（遅延伝播）。実績は動かない。

### 5.7 UI 変更

- ヘッダーの「基準計画固定」チェックボックスを **「基準計画」メニュー** に置き換える:
  - 基準計画として登録（未登録時。現行の予定をスナップショット）
  - 基準計画を更新（登録済み時。差分概要の確認 → 上書き。旧基準は 1 世代退避し、「基準計画を元に戻す」で復帰可能。§5.8）
  - 基準計画を表示（ガントのグレーバー ON/OFF）
  - 基準計画を削除
  - 登録日時の表示（例: 「基準計画: 2026-10-18 登録」）
- 列（WBS 詳細・統合表示）:
  - 予定日付 / 予定期間（既存。意味は「現在の見込み」に統一）
  - 実績日付（実績開始日 / 実績終了日）— 編集可
  - 実績期間 — 表示のみ（導出）
  - 残り期間 — 新規。着工後の主要な入力口
  - 基準計画（基準開始日 / 基準終了日 / 基準期間）— 表示のみ
  - 差異（開始 / 終了 / 期間）— Phase 3
- 列ツールチップ / 設定ダイアログに §5.1 の用語定義を記載する。
- 列の並び（既定案）: タスク名 / ステータス / 進捗率 / 予定日付 / 予定期間 / 実績日付 / 実績期間 / 残り期間（基準計画・差異は必要な人だけ ON）。

### 5.8 基準計画の更新（リスケジュールと再ベースライン）

基準計画に関わる変更は 2 種類あり、扱いを分ける。

| 変更の種類 | 例 | 基準計画の扱い |
| --- | --- | --- |
| **予定のリスケジュール**（通常運用） | 遅れの反映、未完了作業の繰り下げ、依存による後続シフト、進捗に基づく見込み更新 | **触らない**。予定だけが動く |
| **計画そのものの変更**（再ベースライン） | スコープ変更、承認済み計画の改訂、前提条件の大きな変更 | 「基準計画を更新」で**明示的に再登録**する |

- P6 / MS Project でも、通常のリスケジュールや進捗更新で基準計画は動かない。基準計画を変えるのは「基準の設定」「ベースラインの更新」という**明示的な操作**をしたときだけ。実務の推奨は「最初の承認計画は上書きせず、再ベースラインは別枠（Baseline1〜10 / ユーザーベースライン）に追加保存」（§1.2 / §2.2）。
- 本アプリ v1 の設計:
  - **基準計画を更新（上書き再登録）**: 確認ダイアログで差分の概要（予定が変わるタスク件数など）を示してから、現在の予定を新しい基準計画として保存する。
  - **旧基準計画を 1 世代退避**（`previousBaseline*`）し、**「基準計画を元に戻す」**で復帰できるようにする。誤操作や変更撤回の逃げ道を確保する。
  - 登録/更新のたびに `projectConfig.baselineSetAt` を記録し、メニューに「基準計画: 2026-10-18 登録」と表示する。
- UI 文言（誤再ベースラインの抑止）: 確認ダイアログに「通常の日程変更ではこの操作は不要です。承認済みの計画が変わったときだけ更新してください」と明記する。
- 将来拡張（要望が出たら）:
  - 複数の基準計画（B1, B2 …）の並行保持と複数バー表示（P6 のユーザーベースライン相当）
  - **暫定計画**（MS Project の Start1〜10 相当）: 基準計画とは別に「現時点の予定」を名前付きで保存し、比較用に使う。基準計画を汚さずにリスケジュール前後を比較したいときに有効

### 5.9 やらないこと（スコープ外）

- 工数・コスト・EVM、資源山積み
- 複数基準計画の並行保持・暫定計画（§5.8 の将来拡張。v1 は現行 1 本 + 旧 1 世代の退避まで）
- フロート / クリティカルパス計算
- 制約条件（Must Start On 等）、タスク分割（Split）
- 「予定進捗率（Schedule % Complete）」は Phase 3 の遅延表示で部分的に導入を検討

---

## 6. 既存データの移行

読み込み時（`validateProjectState` → `loadProjectState`）に一度だけ変換し、警告トーストで要約を通知する。

### 6.1 `baselineLocked === true` のファイル（ロック運用していたプロジェクト）

「予定 = 凍結した当初計画」「実績 = 更新してきた見込み」として解釈する:

| 変換前 | 変換後 |
| --- | --- |
| `planStartDate` / `planEndDate` / `planDuration` | `baselineStartDate` / `baselineEndDate` / `baselineDuration`（基準計画へ） |
| `startDate` / `endDate` / `duration` | `planStartDate` / `planEndDate` / `planDuration`（予定＝見込みへ） |
| `progress > 0` | `startDate` → 実績開始日 |
| `progress === 100` | `endDate` → 実績終了日 |
| `baselineLocked` | 削除（`false` 扱い） |

これにより「これまで見ていた 2 本のバー」が、そのまま「基準計画バー + 予定バー」として意味を保ったまま引き継がれる。

### 6.2 `baselineLocked !== true` のファイル（既定運用だったプロジェクト）

予定と実績が同じ値（ミラー）になっているため、実績は「進捗のない限り空」として移行する:

| 変換前 | 変換後 |
| --- | --- |
| `planStartDate` 等（なければ `startDate` 等で補完） | 予定（そのまま） |
| `progress > 0` | `startDate` → 実績開始日 |
| `progress === 100` | `endDate` → 実績終了日 |
| `duration` | 導出値に置き換え（保存互換のためフィールドは残す） |
| 基準計画 | なし（「基準計画として登録」で取得） |

### 6.3 保存形式

- トップレベルに `schemaVersion: 2` を付与して保存する（現行はバージョンなし）。
- `baselineLocked` は読み込み時のみ解釈し、以降は保存しない。
- 新フィールドは `validateProjectState` で検証・正規化する（不正日付は null、残り期間は 0 以上の整数へクランプ等）。
- 基準計画は `baseline*`（現行）と `previousBaseline*`（1 世代前）の 2 世代を保存対象とする。世代が揃っていない状態（旧基準なし等）も許容する。
- 旧バージョンのアプリで新形式を開く相互運用は保証しない（`schemaVersion` を見て判別できるようにしておく）。

---

## 7. 段階的実装計画

### Phase 1: モデルと言葉の整理（意味の分離）

**実装状況（2026-10-18）: 完了**。検証は `npm test -- --run` 257 件 / `npm run test:e2e` 5 件 / `npm run lint` 0 / `npm run build` 通過。

- ✅ `Task` に `remainingDuration` / `baselineStartDate` / `baselineEndDate` / `baselineDuration`（+ `previousBaseline*`）を追加（すべて optional で後方互換）。`remainingDuration` は Phase 2 で使う（現状は型のみ）。
- ✅ `updateTask` / `endDragUpdate` の **plan ⇄ actual 双方向同期を廃止**（`applyTaskUpdate` に集約）。
- ⏳ 実績期間の導出値化: `utils/date.ts` に `getActualDuration` は用意したが、`duration` は当面保存フィールドとして維持（Phase 2 で残り期間・予定期間の整合と合わせて導出へ寄せる）。
- ✅ 依存伝播・親ロールアップを「予定のみ」に一本化（`baselineLocked` 分岐を削除）。親の実績は子の実績から別途ロールアップする。
- ✅ 「基準計画固定」→「基準計画」メニュー（登録 / 更新（上書き・旧基準を 1 世代退避）/ 元に戻す / 表示 / 削除、登録日時の表示）。`setBaseline('register' | 'update')` / `restoreBaseline` / `clearBaseline` / `setShowBaseline`。実体は `src/utils/baseline.ts`。
- ✅ ガントを 1 本バー化（予定バー + 進捗塗り。実績は塗り + ツールチップ + `title`）。基準計画は予定バーの下に薄いグレーバー（非操作・案 B）。実績専用バーは廃止。`taskBarRefs` / 依存線アンカーは統合バー 1 本に寄せた。
- ✅ 予定・実績列の表示トグル制限（`baselineLocked` による無効化）を撤去。
- ✅ 旧 JSON の移行（§6、`src/utils/planActualMigration.ts`、`schemaVersion: 2`、警告トースト）。
- ➕ Phase 1 の暫定規則（§5.4 の先取り）: **実績開始日が空のまま実績期間 / 実績終了日を入力した場合は、予定開始日を実績開始日とみなす**（着工済みとして記録）。予定側から実績を推測する処理は入れていない。Phase 2 で進捗基準日と合わせて規則を確定する。
- ⚠️ 実装上の注意: 統合バーに `overflow-hidden` を付けると、バー右外側の依存ハンドルがクリップされてクリックが行の `draw-range` に抜け、予定が「クリックした 1 日」に書き換わる（`e2e/dependency-auto-calculation.spec.ts` が検出）。バーに `overflow-hidden` を付けないこと。
- 受け入れ条件:
  - ✅ 予定を動かしても実績・基準計画が変わらない
  - ✅ 基準計画を登録後、どれだけ運用しても基準計画の値が不変
  - ✅ 「基準計画を更新」後は旧基準へ「元に戻す」で復帰できる
  - ✅ 旧 JSON（ロック運用 / 既定運用の両方）が §6 の規則で壊れずに読める

### Phase 2: 進捗と見込みの連動

- 進捗率 / 残り期間 / 予定期間の整合（§5.3 の表）をストアで実装。1 回の `set` で反映し、Undo 1 エントリを維持。
- 実績開始日・実績終了日入力時の自動規則（着工時 予定開始 = 実績開始、完了時 予定終了 = 実績終了）。
- `projectConfig.statusDate`（進捗基準日、既定 = 今日）。
- 列の追加: 残り期間（入力可）/ 実績期間（表示のみ）。
- 受け入れ条件:
  - §5.4 の 3 ステップシナリオがユニットテストで固定される
  - 進捗 50% 入力 → 残り期間 = 実績期間、予定期間 = 実績 + 残り が成立
  - 依存伝播で後続の予定のみが動き、実績が不変であること

### Phase 3: 基準計画との比較

- 差異列（開始 / 終了 / 期間）と基準計画バー表示の磨き込み。
- 遅延の可視化（基準計画との差、必要なら予定進捗率 = 時間ベースの期待進捗）。
- Excel エクスポートに基準計画・差異・残り期間を追加。

### テスト方針

- `validateProjectState.test.ts`: 移行ケース（locked / unlocked / progress あり / plan 欠落）— **Phase 1 で実装**（既存テストは `validateV2` ヘルパーで現行形式として検証し、旧形式は専用の describe に分離）
- `useTaskStore.test.ts`: 旧「Baseline Plan and Actual Date Synchronization & Locking」を新規則に置き換え — **Phase 1 で実装**（「Plan / Actual are independent」「Baseline snapshot」の 2 ブロック。非干渉テストは `updateTaskIsolation.test.ts`）
- 新規 `planActualModel.test.ts`: §5.3 の入力×初期状態の表駆動テスト — **Phase 2 で追加**（残り期間・進捗基準日が入ってから）
- e2e: 「予定作成 → 基準計画登録 → 実績/進捗入力 → 予定だけが動く → 基準計画が動かない」の 1 本 — **Phase 1 で `e2e/baseline.spec.ts` として実装**（旧 `baseline-lock.spec.ts` を置換）

---

## 8. 未決事項（実装前に決めたい点）

| # | 論点 | 提案（推奨） |
| --- | --- | --- |
| 1 | ガントの既定表示 | **決定（2026-10-18）**: 操作対象は予定バー 1 本に集約。基準計画は非操作の薄いグレーバーで、予定バーの下に数 px ずらして置く（案 B）。実績は進捗塗り + ツールチップ（必要なら実績マーカー） |
| 2 | 実績バーの扱い | **要望反映（2026-10-18）**: 実績専用バー（2 本目）は廃止。実績のアンバーは実績マーカーと進捗塗りのアクセントに引き継ぐ |
| 3 | 残り期間の列 | 着工後の主要入力口として追加（既定表示は任意） |
| 4 | 進捗基準日 | Phase 2 で設定可（既定 = 今日）。週次締めをしないなら今日固定のままでも可 |
| 5 | ステータス列 | 実績（着工・完了）から導出して読み取り専用にする案を推奨。手動上書きが必要ならステータスとは別にフラグを追加 |
| 6 | 予定編集の安全ロック | 残さない（基準計画が当初計画を守るため）。誤操作は Undo で戻す |
| 7 | 基準計画の更新・本数 | v1 は「更新（上書き + 旧 1 世代退避 + 元に戻す）」+ 現行 1 本。複数本の並行保持・暫定計画は将来拡張（§5.8） |

---

## 9. 参考資料

Microsoft Project（Microsoft Support）:

- [Update work on a project](https://support.microsoft.com/en-us/project/update-work-on-a-project)
- [Percent (%) Complete fields](https://support.microsoft.com/en-us/project/percent-complete-fields)
- [Actual Start fields](https://support.microsoft.com/en-us/project/actual-start-fields)
- [Baseline Start fields](https://support.microsoft.com/en-us/project/baseline-start-fields)
- [Create or update a baseline or an interim plan in Project desktop](https://support.microsoft.com/en-us/project/create-or-update-a-baseline-or-an-interim-plan-in-project-desktop)
- [Review the progress of your schedule](https://support.microsoft.com/en-us/project/review-the-progress-of-your-schedule)
- [Set the start date or finish date for your project](https://support.microsoft.com/en-us/project/set-the-start-date-or-finish-date-for-your-project-in-project-desktop)

Oracle Primavera P6:

- [Activity dates](https://docs.oracle.com/cd/F88968_01/English/User_Guides/p6_pro_user/activity_dates.htm)
- [Planned Dates](https://docs.oracle.com/cd/F51301_01/English/User_Guides/p6_eppm_user/98348.htm)
- [Define activity percent complete types](https://docs.oracle.com/cd/F88968_01/English/User_Guides/p6_pro_user/define_activity_percent_complete_types.htm)
- [Percent Complete Columns of the Activity Table](https://docs.oracle.com/cd/F51301_01/p6help/en/47228.htm)
- [More Detail: Specifying a bar's timescale（バーの種類）](https://docs.oracle.com/cd/G18296_01/client_help/ar_EG/more_detail_specifying_a_bars_timescale.htm)
- [Apply a Progress Line to the Gantt Chart](https://docs.oracle.com/cd/F37128_01/client_help/en_US/applying_a_progress_line_to_the_gantt_chart.htm)
- [Schedule Baselines In Primavera P6（Ten Six）](https://tensix.com/schedule-baselines-in-primavera-p6)
- [Update a baseline](https://docs.oracle.com/cd/G48902_01/English/User_Guides/p6_pro_user/update_a_baseline.htm)
- [Working with Baselines](https://docs.oracle.com/cd/F51301_01/p6help/en/6687.htm)

本リポジトリ:

- `src/types.ts`（Task フィールド定義）
- `src/store/useTaskStore.ts`（`updateTask` / `endDragUpdate` の同期ロジック）
- `src/store/taskStoreUtils.ts`（依存伝播・親ロールアップ・`applyDateCalculations`）
- `src/components/GanttTimelineRow.tsx`（バー描画）
- `src/utils/columns.ts` / `src/components/ColumnVisibilityMenu.tsx`（列定義とロック連動）
