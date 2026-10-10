/**
 * Progress tracking and summaries for Aurora Slides and sister project Polaris.
 * Reads progress.jsonl from course/deck directories or exported files.
 */
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

export interface ProgressEvent {
  v: number;
  t: string;
  course?: string | null;
  lesson?: string | null;
  deck: string;
  slide: number;
  slideId?: string | null;
  type: "quiz" | "predict" | "recall" | "complete";
  // quiz
  question?: string;
  chosen?: number[];
  answer?: number[];
  correct?: boolean;
  // predict
  title?: string;
  prediction?: string;
  rating?: "right" | "different" | "got" | "missed";
  output?: string;
  // recall
  palace?: string;
  station?: number;
  place?: string;
  item?: string;
  // complete
  slides?: number;
  quiz?: string | null;
  predictions?: string | null;
}

function eventKey(e: ProgressEvent): string {
  return `${e.t}|${e.type}|${e.lesson ?? ""}|${e.slide}|${e.question ?? e.title ?? e.place ?? e.palace ?? e.slides ?? ""}`;
}

function parseEvents(text: string): ProgressEvent[] {
  const events: ProgressEvent[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const obj = JSON.parse(trimmed);
      if (obj && typeof obj === "object" && obj.v === 1 && typeof obj.type === "string" && typeof obj.t === "string") {
        events.push(obj as ProgressEvent);
      }
    } catch {
      // ignore corrupted line
    }
  }
  return events;
}

function addDays(d: Date, n: number): string {
  const next = new Date(d.getTime() + n * 24 * 60 * 60 * 1000);
  const pad = (v: number) => String(v).padStart(2, "0");
  return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`;
}

export async function loadProgressEvents(dir: string, file?: string): Promise<ProgressEvent[]> {
  const absDir = resolve(dir);
  const seen = new Set<string>();
  const events: ProgressEvent[] = [];

  const candidatePaths: string[] = [];
  const inDir = join(absDir, "progress.jsonl");
  if (existsSync(inDir)) candidatePaths.push(inDir);

  const parentCourse = join(dirname(absDir), "course.json");
  const inParent = join(dirname(absDir), "progress.jsonl");
  if (existsSync(parentCourse) && existsSync(inParent) && !candidatePaths.includes(inParent)) {
    candidatePaths.push(inParent);
  }

  if (file) {
    const absFile = resolve(file);
    if (existsSync(absFile) && !candidatePaths.includes(absFile)) {
      candidatePaths.push(absFile);
    }
  }

  for (const p of candidatePaths) {
    try {
      const content = await readFile(p, "utf8");
      const list = parseEvents(content);
      for (const ev of list) {
        const k = eventKey(ev);
        if (!seen.has(k)) {
          seen.add(k);
          events.push(ev);
        }
      }
    } catch {
      // ignore unreadable file
    }
  }

  return events;
}

export interface LessonSummary {
  lesson: string;
  deck: string;
  lastActivity: string;
  totalEvents: number;
  quizTotal: number;
  quizCorrect: number;
  predictRight: number;
  predictDifferent: number;
  differentPredictions: Array<{ title: string; snippet: string }>;
  missedStations: Array<{ place: string; item: string }>;
  completedDate?: string;
  reviewDates: string[];
}

export function summarizeProgress(events: ProgressEvent[], defaultName = "lesson"): string {
  const POLARIS_POINTER = "Using Polaris? Run polaris_progress_sync to turn this into the error log and the review plan.";
  if (!events.length) {
    return `No progress events found.\n${POLARIS_POINTER}`;
  }

  // Group by lesson (or deck / defaultName)
  const byLesson = new Map<string, ProgressEvent[]>();
  for (const ev of events) {
    const name = ev.lesson || ev.deck || defaultName;
    if (!byLesson.has(name)) byLesson.set(name, []);
    byLesson.get(name)!.push(ev);
  }

  const lessonSummaries: LessonSummary[] = [];

  for (const [name, list] of byLesson.entries()) {
    // Sort events chronologically
    list.sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : 0));
    const lastEv = list[list.length - 1]!;
    const deck = lastEv.deck || name;
    const lastActivity = lastEv.t;

    let quizTotal = 0;
    let quizCorrect = 0;
    let predictRight = 0;
    let predictDifferent = 0;
    const diffPreds: Array<{ title: string; snippet: string }> = [];
    const missedStationsMap = new Map<string, { place: string; item: string }>();
    let completedDate: string | undefined;
    let completeTime: Date | undefined;

    for (const ev of list) {
      if (ev.type === "quiz") {
        quizTotal++;
        if (ev.correct) quizCorrect++;
      } else if (ev.type === "predict") {
        if (ev.rating === "right") {
          predictRight++;
        } else if (ev.rating === "different") {
          predictDifferent++;
          const title = ev.title || "Prediction";
          const snippet = (ev.prediction || "").replace(/\s+/g, " ").trim().slice(0, 100);
          diffPreds.push({ title, snippet });
        }
      } else if (ev.type === "recall") {
        if (ev.rating === "missed" && ev.place) {
          const k = `${ev.place}->${ev.item ?? ""}`;
          if (!missedStationsMap.has(k)) {
            missedStationsMap.set(k, { place: ev.place, item: ev.item || "" });
          }
        }
      } else if (ev.type === "complete") {
        completedDate = ev.t.split("T")[0] || ev.t;
        completeTime = new Date(ev.t);
      }
    }

    const reviewDates: string[] = [];
    if (completeTime && !isNaN(completeTime.getTime())) {
      const intervals = [1, 3, 7, 16, 35];
      intervals.forEach((days) => {
        reviewDates.push(`+${days}d (${addDays(completeTime!, days)})`);
      });
    }

    lessonSummaries.push({
      lesson: name,
      deck,
      lastActivity,
      totalEvents: list.length,
      quizTotal,
      quizCorrect,
      predictRight,
      predictDifferent,
      differentPredictions: diffPreds,
      missedStations: Array.from(missedStationsMap.values()),
      completedDate,
      reviewDates,
    });
  }

  const lines: string[] = [];
  lines.push(`Learning Progress Summary (${lessonSummaries.length} lesson(s), ${events.length} event(s)):`);

  for (const s of lessonSummaries) {
    lines.push("");
    lines.push(`### ${s.lesson}${s.deck && s.deck !== s.lesson ? ` (${s.deck})` : ""}`);
    lines.push(`- Last activity: ${s.lastActivity}`);

    if (s.quizTotal > 0) {
      const pct = Math.round((s.quizCorrect / s.quizTotal) * 100);
      lines.push(`- Quiz accuracy: ${s.quizCorrect}/${s.quizTotal} (${pct}%)`);
    }

    if (s.predictRight > 0 || s.predictDifferent > 0) {
      lines.push(`- Predictions: ${s.predictRight} right, ${s.predictDifferent} different`);
      if (s.differentPredictions.length > 0) {
        s.differentPredictions.forEach((p) => {
          lines.push(`  • ${p.title}: "${p.snippet}"`);
        });
      }
    }

    if (s.missedStations.length > 0) {
      lines.push(`- Missed palace stations:`);
      s.missedStations.forEach((m) => {
        lines.push(`  • ${m.place} -> ${m.item}`);
      });
    }

    if (s.completedDate) {
      lines.push(`- Completed on: ${s.completedDate}`);
      if (s.reviewDates.length > 0) {
        lines.push(`- Spaced reviews due: ${s.reviewDates.join(", ")}`);
      }
    }
  }

  lines.push("");
  lines.push(POLARIS_POINTER);
  return lines.join("\n");
}
