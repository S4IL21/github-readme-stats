// @ts-check

import { afterEach, describe, expect, it } from "@jest/globals";
import axios from "axios";
import MockAdapter from "axios-mock-adapter";
import streakApi from "../api/streak.js";
import { generateCard, generateOutput } from "../src/streak/card.js";
import {
  getContributionStats,
  getWeeklyContributionStats,
  getPreviousSunday,
  normalizeDays,
} from "../src/streak/stats.js";

describe("streak stats", () => {
  it("computes daily streaks", () => {
    const stats = getContributionStats({
      "2024-01-01": 1,
      "2024-01-02": 2,
      "2024-01-03": 0,
      "2024-01-04": 1,
      "2024-01-05": 1,
      "2024-01-06": 0, // today: gets an exception
    });
    expect(stats.totalContributions).toBe(5);
    expect(stats.longestStreak).toEqual({
      start: "2024-01-01",
      end: "2024-01-02",
      length: 2,
    });
    expect(stats.currentStreak.length).toBe(2);
    expect(stats.currentStreak.start).toBe("2024-01-04");
  });

  it("supports excluded days", () => {
    // 2024-01-06 is a Saturday, 2024-01-07 a Sunday
    const stats = getContributionStats(
      { "2024-01-05": 1, "2024-01-06": 0, "2024-01-07": 0, "2024-01-08": 1 },
      normalizeDays(["sat", " SUNDAY", "foo"]),
    );
    expect(stats.currentStreak.length).toBe(4);
  });

  it("computes weekly streaks", () => {
    expect(getPreviousSunday("2024-01-10")).toBe("2024-01-07");
    const stats = getWeeklyContributionStats({
      "2024-01-01": 1,
      "2024-01-09": 1,
      "2024-01-16": 1,
    });
    expect(stats.mode).toBe("weekly");
    expect(stats.longestStreak.length).toBe(3);
  });

  it("renders a card and json", () => {
    const stats = getContributionStats({ "2020-01-01": 3, "2020-01-02": 1 });
    const svg = generateCard(stats, { theme: "dark", locale: "fr" });
    expect(svg).toContain("Contributions totales");
    expect(generateOutput(stats, { type: "json" }).contentType).toBe(
      "application/json",
    );
    expect(
      generateOutput("oops <b>", { border_radius: "x'><script>" }).body,
    ).not.toContain("<script>");
  });
});

describe("streak api (multi account)", () => {
  const mock = new MockAdapter(axios);
  const year = new Date().getUTCFullYear();
  const today = new Date().toISOString().slice(0, 10);

  afterEach(() => {
    mock.reset();
    delete process.env.AGGREGATE_PATS;
    delete process.env.AGGREGATE_USERNAME;
  });

  /**
   * @param {string} login Login.
   * @param {number} count Contributions today.
   * @returns {any} GraphQL response.
   */
  const viewer = (login, count) => ({
    data: {
      viewer: {
        login,
        createdAt: `${year}-01-01T00:00:00Z`,
        contributionsCollection: {
          contributionYears: [year],
          contributionCalendar: {
            weeks: [
              { contributionDays: [{ date: today, contributionCount: count }] },
            ],
          },
        },
      },
    },
  });

  it("merges every account's contributions", async () => {
    process.env.AGGREGATE_PATS = "tokA,tokB";
    process.env.AGGREGATE_USERNAME = "Main";
    mock.onPost("https://api.github.com/graphql").reply((config) => {
      const token = config.headers?.Authorization;
      return token === "bearer tokA"
        ? [200, viewer("Main", 3)]
        : [200, viewer("Other", 4)];
    });
    /** @type {any} */
    const res = {
      headers: {},
      setHeader(/** @type {string} */ k, /** @type {string} */ v) {
        this.headers[k] = v;
      },
      status() {
        return this;
      },
      send(/** @type {any} */ body) {
        this.body = body;
        return this;
      },
    };
    await streakApi({ query: { user: "main", type: "json" } }, res);
    expect(JSON.parse(res.body).totalContributions).toBe(7);
    expect(mock.history.post.length).toBe(2);
  });
});
