// @ts-check

// Port of github-readme-streak-stats (stats.php + generator.php) to JavaScript,
// with support for aggregating several GitHub accounts.

import { request } from "../common/http.js";
import { logger } from "../common/log.js";

class StreakError extends Error {
  /**
   * @param {string} message Error message.
   * @param {number} code HTTP-like error code.
   */
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * @typedef {{ start: string, end: string, length: number }} Streak
 * @typedef {{
 *   mode: "daily" | "weekly",
 *   totalContributions: number,
 *   firstContribution: string,
 *   longestStreak: Streak,
 *   currentStreak: Streak,
 *   excludedDays?: string[],
 * }} StreakStats
 */

// ---------------------------------------------------------------------------
// Date helpers (all dates are "YYYY-MM-DD" strings, handled in UTC)
// ---------------------------------------------------------------------------

/**
 * @param {string} date Y-m-d date.
 * @param {number} days Days to add.
 * @returns {string} Resulting Y-m-d date.
 */
const addDays = (date, days) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/**
 * @param {string} date Y-m-d date.
 * @returns {number} Day of week (0 = Sunday).
 */
const dayOfWeek = (date) => new Date(`${date}T00:00:00Z`).getUTCDay();

/**
 * @param {string} date Y-m-d date.
 * @returns {string} Previous Sunday (or the same date if Sunday).
 */
const getPreviousSunday = (date) => addDays(date, -dayOfWeek(date));

/**
 * Current date in a timezone.
 *
 * @param {string} timezone Timezone identifier, empty for UTC.
 * @param {Date} now Current time (override for tests).
 * @returns {string} Y-m-d date.
 */
const getCurrentDate = (timezone = "", now = new Date()) => {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone || "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  } catch {
    throw new StreakError("Invalid timezone.", 400);
  }
};

/**
 * @param {string[]} days Day names.
 * @returns {string[]} Normalized day names (Sun, Mon, ...).
 */
const normalizeDays = (days) =>
  days
    .map((d) => {
      const t = d.trim().toLowerCase();
      return (t.charAt(0).toUpperCase() + t.slice(1)).slice(0, 3);
    })
    .filter((d) => DAY_NAMES.includes(d));

/**
 * @param {string} date Y-m-d date.
 * @param {string[]} excludedDays Excluded day names.
 * @returns {boolean} Whether the date falls on an excluded day.
 */
const isExcludedDay = (date, excludedDays) =>
  excludedDays.length > 0 && excludedDays.includes(DAY_NAMES[dayOfWeek(date)]);

// ---------------------------------------------------------------------------
// Streak calculation
// ---------------------------------------------------------------------------

/**
 * @param {Record<string, number>} contributions Date -> count (sorted by date).
 * @param {string[]} excludedDays Excluded days of the week.
 * @returns {StreakStats} Daily stats.
 */
const getContributionStats = (contributions, excludedDays = []) => {
  const dates = Object.keys(contributions).sort();
  if (dates.length === 0) {
    throw new StreakError("No contributions found.", 204);
  }
  const today = dates[dates.length - 1];
  const first = dates[0];
  /** @type {StreakStats} */
  const stats = {
    mode: "daily",
    totalContributions: 0,
    firstContribution: "",
    longestStreak: { start: first, end: first, length: 0 },
    currentStreak: { start: first, end: first, length: 0 },
    excludedDays,
  };

  for (const date of dates) {
    const count = contributions[date];
    stats.totalContributions += count;
    if (
      count > 0 ||
      (stats.currentStreak.length > 0 && isExcludedDay(date, excludedDays))
    ) {
      stats.currentStreak.length++;
      stats.currentStreak.end = date;
      if (stats.currentStreak.length === 1) {
        stats.currentStreak.start = date;
      }
      if (!stats.firstContribution) {
        stats.firstContribution = date;
      }
      if (stats.currentStreak.length > stats.longestStreak.length) {
        stats.longestStreak = { ...stats.currentStreak };
      }
    } else if (date !== today) {
      stats.currentStreak = { start: today, end: today, length: 0 };
    }
  }
  return stats;
};

/**
 * @param {Record<string, number>} contributions Date -> count.
 * @returns {StreakStats} Weekly stats.
 */
const getWeeklyContributionStats = (contributions) => {
  const dates = Object.keys(contributions).sort();
  if (dates.length === 0) {
    throw new StreakError("No contributions found.", 204);
  }
  const thisWeek = getPreviousSunday(dates[dates.length - 1]);
  const firstWeek = getPreviousSunday(dates[0]);
  /** @type {StreakStats} */
  const stats = {
    mode: "weekly",
    totalContributions: 0,
    firstContribution: "",
    longestStreak: { start: firstWeek, end: firstWeek, length: 0 },
    currentStreak: { start: firstWeek, end: firstWeek, length: 0 },
  };

  /** @type {Record<string, number>} */
  const weeks = {};
  for (const date of dates) {
    const week = getPreviousSunday(date);
    if (!(week in weeks)) {
      weeks[week] = 0;
    }
    if (contributions[date] > 0) {
      weeks[week] += contributions[date];
      if (!stats.firstContribution) {
        stats.firstContribution = date;
      }
    }
  }

  for (const week of Object.keys(weeks).sort()) {
    const count = weeks[week];
    stats.totalContributions += count;
    if (count > 0) {
      stats.currentStreak.length++;
      stats.currentStreak.end = week;
      if (stats.currentStreak.length === 1) {
        stats.currentStreak.start = week;
      }
      if (stats.currentStreak.length > stats.longestStreak.length) {
        stats.longestStreak = { ...stats.currentStreak };
      }
    } else if (week !== thisWeek) {
      stats.currentStreak = { start: thisWeek, end: thisWeek, length: 0 };
    }
  }
  return stats;
};

// ---------------------------------------------------------------------------
// GitHub fetching
// ---------------------------------------------------------------------------

/**
 * Tokens for the extra accounts (AGGREGATE_PATS).
 *
 * @returns {string[]} Tokens.
 */
const getAggregateTokens = () =>
  (process.env.AGGREGATE_PATS || "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

/**
 * Generic PAT_1, PAT_2... tokens.
 *
 * @returns {string[]} Tokens.
 */
const getPatTokens = () =>
  Object.keys(process.env)
    .filter((k) => /^PAT_\d+$/.test(k))
    .sort()
    .map((k) => /** @type {string} */ (process.env[k]));

/**
 * Whether streak should be merged across every account in AGGREGATE_PATS.
 *
 * @param {string} user Username.
 * @returns {boolean} True if aggregating.
 */
const shouldAggregate = (user) =>
  getAggregateTokens().length > 0 &&
  !!process.env.AGGREGATE_USERNAME &&
  user.toLowerCase() === process.env.AGGREGATE_USERNAME.toLowerCase();

/**
 * @param {string} root GraphQL root, `user(login: "x")` or `viewer`.
 * @param {number} year Year.
 * @returns {string} Query.
 */
const buildQuery = (root, year) => `query {
  ${root} {
    login
    createdAt
    contributionsCollection(from: "${year}-01-01T00:00:00Z", to: "${year}-12-31T23:59:59Z") {
      contributionYears
      contributionCalendar {
        weeks {
          contributionDays {
            contributionCount
            date
          }
        }
      }
    }
  }
}`;

/**
 * Run a query trying each token in order until one works.
 *
 * @param {string} query GraphQL query.
 * @param {string[]} tokens Candidate tokens (tried in this order).
 * @param {"user"|"viewer"} key Root key of the response.
 * @returns {Promise<any>} The user object.
 */
const runQuery = async (query, tokens, key) => {
  let lastMessage = "An API error occurred.";
  for (const token of tokens) {
    let res;
    try {
      res = await request(
        { query },
        {
          Authorization: `bearer ${token}`,
          "User-Agent": "GitHub-Readme-Streak-Stats",
        },
      );
    } catch (err) {
      /** @type {any} */
      const e = err;
      lastMessage = e?.response?.data?.message || e?.message || lastMessage;
      logger.log(`Streak request failed: ${lastMessage}`);
      continue;
    }
    const errors = res.data?.errors;
    if (errors?.[0]?.type === "NOT_FOUND") {
      throw new StreakError("Could not find a user with that name.", 404);
    }
    if (errors || !res.data?.data?.[key]) {
      lastMessage = errors?.[0]?.message || lastMessage;
      logger.log(`Streak query failed: ${lastMessage}`);
      continue;
    }
    return res.data.data[key];
  }
  if (/rate limit/i.test(lastMessage)) {
    throw new StreakError("We are being rate-limited!", 429);
  }
  throw new StreakError(
    "Failed to retrieve contributions. This is likely a GitHub API issue.",
    500,
  );
};

/**
 * Fetch every year of contributions for one account.
 *
 * @param {string} root GraphQL root.
 * @param {"user"|"viewer"} key Root key.
 * @param {string[]} tokens Tokens to try.
 * @param {number|null} startingYear Optional minimum year.
 * @returns {Promise<{ createdYear: number, calendars: any[] }>} Calendars.
 */
const fetchAccountCalendars = async (root, key, tokens, startingYear) => {
  const currentYear = new Date().getUTCFullYear();
  const current = await runQuery(buildQuery(root, currentYear), tokens, key);
  const createdYear = parseInt(current.createdAt.split("-")[0], 10);
  const minimumYear = Math.max(startingYear || createdYear, 2005);
  const years = [];
  for (let y = minimumYear; y < currentYear; y++) {
    years.push(y);
  }
  // users may have backdated commits to years before 2005 (see upstream #448)
  const contributionYears = current.contributionsCollection.contributionYears;
  const firstContributionYear =
    contributionYears[contributionYears.length - 1] ?? createdYear;
  if (firstContributionYear < 2005) {
    years.unshift(firstContributionYear);
  }
  const rest = await Promise.all(
    years.map((y) => runQuery(buildQuery(root, y), tokens, key)),
  );
  return { createdYear, calendars: [current, ...rest] };
};

/**
 * Merge calendars into date -> count, only counting up to today (and tomorrow
 * if the user already contributed there because of timezones).
 *
 * @param {any[]} calendars Calendars from every account/year.
 * @param {string} timezone Timezone.
 * @param {Date} now Current time.
 * @returns {Record<string, number>} Contributions per date.
 */
const getContributionDates = (calendars, timezone = "", now = new Date()) => {
  /** @type {Record<string, number>} */
  const contributions = {};
  const today = getCurrentDate(timezone, now);
  const tomorrow = addDays(today, 1);
  /** @type {Record<string, number>} */
  const perDate = {};
  for (const user of calendars) {
    const weeks = user.contributionsCollection.contributionCalendar.weeks || [];
    for (const week of weeks) {
      for (const day of week.contributionDays) {
        perDate[day.date] = (perDate[day.date] || 0) + day.contributionCount;
      }
    }
  }
  for (const date of Object.keys(perDate).sort()) {
    const count = perDate[date];
    if (date <= today || (date === tomorrow && count > 0)) {
      contributions[date] = count;
    }
  }
  return contributions;
};

/**
 * Generate streak stats for a user.
 *
 * @param {string} rawUser GitHub username.
 * @param {Record<string, any>} params Query parameters.
 * @returns {Promise<StreakStats>} Stats.
 */
const generateStreakStats = async (rawUser, params = {}) => {
  const user = String(rawUser || "").replace(/[^a-zA-Z0-9-]/g, "");
  if (!user) {
    throw new StreakError("GitHub username is required.", 400);
  }
  const startingYear = params.starting_year
    ? parseInt(params.starting_year, 10) || null
    : null;
  const mode = params.mode ? String(params.mode) : null;
  const timezone = params.timezone ? String(params.timezone) : "";
  getCurrentDate(timezone); // validate timezone early

  let calendars;
  if (shouldAggregate(user)) {
    // every token's own account (viewer): includes private contributions
    const settled = await Promise.allSettled(
      getAggregateTokens().map((token) =>
        fetchAccountCalendars("viewer", "viewer", [token], startingYear),
      ),
    );
    const accounts = settled.flatMap((s) =>
      s.status === "fulfilled" ? [s.value] : [],
    );
    if (accounts.length === 0) {
      // every account failed: surface the first error
      throw /** @type {PromiseRejectedResult} */ (settled[0]).reason;
    }
    if (accounts.length < settled.length) {
      logger.error("Some aggregate accounts failed and were skipped.");
    }
    calendars = accounts.flatMap((a) => a.calendars);
  } else {
    const tokens = [...getPatTokens(), ...getAggregateTokens()];
    if (tokens.length === 0) {
      throw new StreakError("No GitHub API tokens found", 500);
    }
    const account = await fetchAccountCalendars(
      `user(login: "${user}")`,
      "user",
      tokens,
      startingYear,
    );
    calendars = account.calendars;
  }

  const contributions = getContributionDates(calendars, timezone);
  if (mode === "weekly") {
    return getWeeklyContributionStats(contributions);
  }
  const excludeDays = normalizeDays(
    String(params.exclude_days || "").split(","),
  );
  return getContributionStats(contributions, excludeDays);
};

export {
  StreakError,
  generateStreakStats,
  getContributionStats,
  getWeeklyContributionStats,
  getContributionDates,
  getCurrentDate,
  getPreviousSunday,
  normalizeDays,
  shouldAggregate,
};
