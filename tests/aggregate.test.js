// @ts-check

import { afterEach, describe, expect, it } from "@jest/globals";
import axios from "axios";
import MockAdapter from "axios-mock-adapter";
import { fetchStats } from "../src/fetchers/stats.js";
import { fetchTopLanguages } from "../src/fetchers/top-languages.js";

const mock = new MockAdapter(axios);

afterEach(() => {
  mock.reset();
  delete process.env.AGGREGATE_PATS;
  delete process.env.AGGREGATE_USERNAME;
});

/**
 * @param {string} login Login.
 * @param {number} n Base number for counts.
 * @param {number} stars Stars of the single repo.
 * @returns {any} Viewer stats response.
 */
const viewerStats = (login, n, stars) => ({
  data: {
    viewer: {
      name: `${login} name`,
      login,
      commits: { totalCommitContributions: n },
      reviews: { totalPullRequestReviewContributions: n },
      repositoriesContributedTo: { totalCount: n },
      pullRequests: { totalCount: n },
      openIssues: { totalCount: n },
      closedIssues: { totalCount: n },
      followers: { totalCount: n },
      repositories: {
        totalCount: 1,
        nodes: [{ name: `${login}-repo`, stargazers: { totalCount: stars } }],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    },
  },
});

/**
 * @param {string} nameWithOwner Repo.
 * @param {string} lang Language.
 * @param {number} size Bytes.
 * @returns {any} Repo node.
 */
const repo = (nameWithOwner, lang, size) => ({
  nameWithOwner,
  name: nameWithOwner.split("/")[1],
  languages: { edges: [{ size, node: { name: lang, color: "#000" } }] },
});

describe("aggregate stats", () => {
  it("sums every account and skips a broken token", async () => {
    process.env.AGGREGATE_PATS = "tokA,tokB,tokBad";
    process.env.AGGREGATE_USERNAME = "Main";
    mock.onPost("https://api.github.com/graphql").reply((config) => {
      switch (config.headers?.Authorization) {
        case "bearer tokA":
          return [200, viewerStats("Main", 1, 10)];
        case "bearer tokB":
          return [200, viewerStats("Other", 2, 5)];
        default:
          return [401, { message: "Bad credentials" }];
      }
    });
    const stats = await fetchStats("main");
    expect(stats.name).toBe("Main name");
    expect(stats.totalCommits).toBe(3);
    expect(stats.totalPRs).toBe(3);
    expect(stats.totalIssues).toBe(6);
    expect(stats.totalStars).toBe(15);
    expect(stats.contributedTo).toBe(3);
  });

  it("is not used for other usernames", async () => {
    process.env.AGGREGATE_PATS = "tokA";
    process.env.AGGREGATE_USERNAME = "Main";
    mock
      .onPost("https://api.github.com/graphql")
      .reply(() => [
        200,
        { data: { user: viewerStats("Someone", 1, 1).data.viewer } },
      ]);
    const stats = await fetchStats("someone");
    expect(stats.totalCommits).toBe(1);
    expect(mock.history.post.length).toBe(1);
  });
});

describe("aggregate top languages", () => {
  it("merges accounts, dedupes repos and skips a broken token", async () => {
    process.env.AGGREGATE_PATS = "tokA,tokB,tokBad";
    process.env.AGGREGATE_USERNAME = "Main";
    mock.onPost("https://api.github.com/graphql").reply((config) => {
      const mk = (/** @type {any[]} */ nodes) => [
        200,
        {
          data: {
            viewer: {
              repositories: {
                pageInfo: { hasNextPage: false, endCursor: null },
                nodes,
              },
            },
          },
        },
      ];
      switch (config.headers?.Authorization) {
        case "token tokA":
          return mk([repo("Main/a", "JavaScript", 100)]);
        case "token tokB":
          return mk([
            repo("Other/b", "Python", 300),
            repo("Main/a", "JavaScript", 100), // collaborator duplicate
          ]);
        default:
          return [401, { message: "Bad credentials" }];
      }
    });
    const langs = await fetchTopLanguages("MAIN");
    expect(Object.keys(langs)).toEqual(["Python", "JavaScript"]);
    expect(langs.JavaScript.size).toBe(100);
    expect(langs.Python.size).toBe(300);
  });
});
