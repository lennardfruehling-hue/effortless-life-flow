import { Task } from "@/lib/types";
import { Habit, todayISO, isHabitDue, isHabitCompleteOn, daysBetween } from "@/lib/habits";

export interface OrgTip {
  id: string;
  title: string;
  detail: string;
  /** Which organizational principle the tip is rooted in. */
  principle: string;
  severity: "info" | "warn" | "good";
}

const cats = (t: Task) => (t.categories || []).map((c) => String(c).toUpperCase());

/**
 * Behaviour-based organization tips, derived from how the user has actually been
 * using the system over time, mapped onto the app's organizational principles
 * (A–K classification, one A1 at a time, Plan → Act → Review, consistency first,
 * everything lands in the day's shape).
 */
export function buildOrgTips(tasks: Task[], habits: Habit[]): OrgTip[] {
  const today = todayISO();
  const tips: OrgTip[] = [];
  const open = (tasks || []).filter((t) => !t.completed);
  const done = (tasks || []).filter((t) => t.completed);

  // 0a. Dates are commitments — upcoming deadlines
  const upcoming = upcomingDeadlines(tasks, 3);
  if (upcoming.length > 0) {
    const next = upcoming[0];
    const inDays = daysBetween(today, next.dueDate!);
    tips.push({
      id: "deadline-soon",
      title:
        inDays <= 0
          ? `"${next.title}" is due today`
          : `${upcoming.length} date${upcoming.length > 1 ? "s" : ""} due within 3 days`,
      detail: `Next up: "${next.title}" on ${next.dueDate}. A date on the list is a commitment — block the time now, don't renegotiate it.`,
      principle: "Intention is what happens no matter what",
      severity: inDays <= 1 ? "warn" : "info",
    });
  }

  // 0b. Broken commitments cost pride points
  const week = weeklyScore(tasks);
  if (week.penalty > 0) {
    tips.push({
      id: "penalty",
      title: `−${week.penalty} pride points lost this week`,
      detail: `${week.failed} item${week.failed > 1 ? "s" : ""} on your list went unfinished past their date. Once it's on the list it's non-negotiable: clear them today to stop the bleed and stay on track for the reward.`,
      principle: "Once it's on the list it's non-negotiable",
      severity: "warn",
    });
  } else if (week.target > 0 && week.progress >= 1) {
    tips.push({
      id: "target-met",
      title: "Weekly target met",
      detail: `${week.net}/${week.target} points with nothing broken. This week counts towards the reward.`,
      principle: "Intention is what happens no matter what",
      severity: "good",
    });
  }



  // 1. Too many A1s open at once
  const a1 = open.filter((t) => cats(t).includes("A1"));
  if (a1.length > 3) {
    tips.push({
      id: "a1-overload",
      title: `${a1.length} tasks are marked A1`,
      detail: "A1 means 'the one thing now'. Demote all but one or two to A2/B1 so the day has a real head.",
      principle: "A–K classification",
      severity: "warn",
    });
  }

  // 2. Uncategorised tasks
  const uncategorised = open.filter((t) => cats(t).length === 0);
  if (uncategorised.length >= 3) {
    tips.push({
      id: "uncategorised",
      title: `${uncategorised.length} open tasks have no category`,
      detail: "Uncategorised work never gets ranked into the day. Give each one an A–K category when you capture it.",
      principle: "A–K classification",
      severity: "warn",
    });
  }

  // 3. Overdue build-up
  const overdue = open.filter((t) => t.dueDate && t.dueDate < today);
  if (overdue.length >= 5) {
    tips.push({
      id: "overdue-pile",
      title: `${overdue.length} tasks are past their due date`,
      detail: "A backlog of overdue items means dates are being used as wishes. Re-date them honestly or delete them in the Review step.",
      principle: "Plan → Act → Review",
      severity: "warn",
    });
  }

  // 4. Nothing scheduled for today
  const dueToday = open.filter((t) => t.dueDate === today);
  if (dueToday.length === 0 && open.length > 0) {
    tips.push({
      id: "no-today",
      title: "Nothing is dated for today",
      detail: "Pull two or three items into today so the day has a shape instead of an open backlog.",
      principle: "The day's shape",
      severity: "info",
    });
  }

  // 5. Consistency logging drift over the last 14 days
  if ((habits || []).length > 0) {
    let dueCount = 0;
    let doneCount = 0;
    for (let i = 0; i < 14; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const iso = todayISO(d);
      for (const h of habits) {
        if (!isHabitDue(h, iso)) continue;
        dueCount++;
        if (isHabitCompleteOn(h, iso)) doneCount++;
      }
    }
    if (dueCount > 0) {
      const rate = Math.round((doneCount / dueCount) * 100);
      if (rate < 60) {
        tips.push({
          id: "consistency-low",
          title: `Consistency at ${rate}% over 14 days`,
          detail: "Cut the list of consistency tasks down to the two or three you will actually do daily — a short list you keep beats a long one you don't.",
          principle: "Consistency before intensity",
          severity: "warn",
        });
      } else if (rate >= 85) {
        tips.push({
          id: "consistency-high",
          title: `Consistency at ${rate}% over 14 days`,
          detail: "The base is holding. This is the moment to add one new habit — not three.",
          principle: "Consistency before intensity",
          severity: "good",
        });
      }
    }
  }

  // 6. Capture-without-closing pattern
  const recentCreated = (tasks || []).filter((t) => t.createdAt && daysBetween(String(t.createdAt).slice(0, 10), today) <= 7).length;
  const recentDone = done.filter((t: any) => t.completedAt && daysBetween(String(t.completedAt).slice(0, 10), today) <= 7).length;
  if (recentCreated >= 5 && recentDone * 2 < recentCreated) {
    tips.push({
      id: "capture-gap",
      title: "Capturing faster than closing",
      detail: `${recentCreated} tasks added vs ${recentDone} completed this week. Spend the Review step closing or deleting, not adding.`,
      principle: "Plan → Act → Review",
      severity: "warn",
    });
  }

  // 7. Stale long-lived tasks
  const stale = open.filter((t) => t.createdAt && daysBetween(String(t.createdAt).slice(0, 10), today) > 30);
  if (stale.length >= 3) {
    tips.push({
      id: "stale",
      title: `${stale.length} tasks are older than 30 days`,
      detail: "Anything sitting a month untouched is a project, not a task. Move it into the Life Plan or drop it.",
      principle: "Life Plan owns the long game",
      severity: "info",
    });
  }

  if (tips.length === 0) {
    tips.push({
      id: "clean",
      title: "The system looks well kept",
      detail: "Categories are set, the backlog is contained and consistency is being logged. Keep the loop running.",
      principle: "Plan → Act → Review",
      severity: "good",
    });
  }

  return tips;
}
