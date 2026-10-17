// @ts-check

import {
  DURATIONS,
  resolveCacheSeconds,
  setCacheHeaders,
  setErrorCacheHeaders,
} from "../src/common/cache.js";
import { whitelist } from "../src/common/envs.js";
import { blacklist } from "../src/common/blacklist.js";
import { generateOutput } from "../src/streak/card.js";
import { StreakError, generateStreakStats } from "../src/streak/stats.js";

/**
 * Streak stats endpoint (port of github-readme-streak-stats).
 * Usage: /api/streak?user=USERNAME
 * When the user matches AGGREGATE_USERNAME, contributions of every account in
 * AGGREGATE_PATS are merged.
 *
 * @param {any} req Request.
 * @param {any} res Response.
 * @returns {Promise<any>} Response.
 */
export default async (req, res) => {
  const params = req.query || {};
  const user = String(params.user || params.username || "");

  /**
   * @param {string | import("../src/streak/stats.js").StreakStats} output Stats or error.
   * @param {number} code Error code.
   * @returns {any} Response.
   */
  const send = (output, code = 200) => {
    const out = generateOutput(output, params, code);
    res.setHeader("Content-Type", out.contentType);
    // Always 200 so GitHub's image proxy (Camo) renders the error card.
    return res.status(200).send(out.body);
  };

  if (!user) {
    setErrorCacheHeaders(res);
    return send("GitHub username is required. Use ?user=USERNAME", 400);
  }
  if (
    (Array.isArray(whitelist) && !whitelist.includes(user)) ||
    (whitelist === undefined && blacklist.includes(user))
  ) {
    setErrorCacheHeaders(res);
    return send("This username is not allowed", 403);
  }

  try {
    const stats = await generateStreakStats(user, params);
    setCacheHeaders(
      res,
      resolveCacheSeconds({
        requested: parseInt(params.cache_seconds, 10),
        def: DURATIONS.FOUR_HOURS,
        min: DURATIONS.THIRTY_MINUTES,
        max: DURATIONS.ONE_DAY,
      }),
    );
    return send(stats);
  } catch (err) {
    setErrorCacheHeaders(res);
    if (err instanceof StreakError) {
      return send(err.message, err.code);
    }
    /** @type {any} */
    const e = err;
    return send(e?.message || "Something went wrong", 500);
  }
};
