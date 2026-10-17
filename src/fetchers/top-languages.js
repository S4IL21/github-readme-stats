// @ts-check

import { retryer } from "../common/retryer.js";
import { logger } from "../common/log.js";
import { excludeRepositories } from "../common/envs.js";
import { CustomError, MissingParamError } from "../common/error.js";
import { wrapTextMultiline } from "../common/fmt.js";
import { request } from "../common/http.js";

/**
 * Top languages fetcher object.
 *
 * @param {any} variables Fetcher variables.
 * @param {string} token GitHub token.
 * @returns {Promise<import("axios").AxiosResponse>} Languages fetcher response.
 */
const fetcher = (variables, token) => {
  return request(
    {
      query: `
      query userInfo($login: String!) {
        user(login: $login) {
          # fetch only owner repos & not forks
          repositories(ownerAffiliations: OWNER, isFork: false, first: 100) {
            nodes {
              name
              languages(first: 10, orderBy: {field: SIZE, direction: DESC}) {
                edges {
                  size
                  node {
                    color
                    name
                  }
                }
              }
            }
          }
        }
      }
      `,
      variables,
    },
    {
      Authorization: `token ${token}`,
    },
  );
};

/**
 * Fetch all owned non-fork repos (including private) of the account a token belongs to.
 *
 * @param {string} token GitHub token (needs `repo` scope for private repos).
 * @returns {Promise<any[]>} Repo nodes.
 */
const fetchViewerRepos = async (token) => {
  const nodes = [];
  let after = null;
  for (let page = 0; page < 20; page++) {
    const res = await request(
      {
        query: `
        query viewerRepos($after: String) {
          viewer {
            repositories(ownerAffiliations: OWNER, isFork: false, first: 100, after: $after) {
              pageInfo { hasNextPage endCursor }
              nodes {
                nameWithOwner
                name
                languages(first: 10, orderBy: {field: SIZE, direction: DESC}) {
                  edges { size node { color name } }
                }
              }
            }
          }
        }`,
        variables: { after },
      },
      { Authorization: `token ${token}` },
    );
    const repos = res.data?.data?.viewer?.repositories;
    if (!repos) {
      logger.error(res.data?.errors || "Could not fetch viewer repos");
      break;
    }
    nodes.push(...repos.nodes);
    if (!repos.pageInfo.hasNextPage) break;
    after = repos.pageInfo.endCursor;
  }
  return nodes;
};

/**
 * Collect repos from all accounts configured in AGGREGATE_PATS (comma separated tokens).
 *
 * @returns {Promise<any[]>} Deduplicated repo nodes.
 */
const fetchAggregatedRepos = async () => {
  const tokens = (process.env.AGGREGATE_PATS || "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const all = await Promise.all(tokens.map(fetchViewerRepos));
  const seen = new Set();
  return all.flat().filter((r) => {
    if (seen.has(r.nameWithOwner)) return false;
    seen.add(r.nameWithOwner);
    return true;
  });
};

/**
 * @typedef {import("./types").TopLangData} TopLangData Top languages data.
 */

/**
 * Fetch top languages for a given username.
 *
 * @param {string} username GitHub username.
 * @param {string[]} exclude_repo List of repositories to exclude.
 * @param {number} size_weight Weightage to be given to size.
 * @param {number} count_weight Weightage to be given to count.
 * @returns {Promise<TopLangData>} Top languages data.
 */
const fetchTopLanguages = async (
  username,
  exclude_repo = [],
  size_weight = 1,
  count_weight = 0,
) => {
  if (!username) {
    throw new MissingParamError(["username"]);
  }

  const aggregate =
    !!process.env.AGGREGATE_PATS &&
    !!process.env.AGGREGATE_USERNAME &&
    username.toLowerCase() === process.env.AGGREGATE_USERNAME.toLowerCase();

  const res = aggregate
    ? {
        data: {
          data: {
            user: { repositories: { nodes: await fetchAggregatedRepos() } },
          },
        },
      }
    : await retryer(fetcher, { login: username });

  if (res.data.errors) {
    logger.error(res.data.errors);
    if (res.data.errors[0].type === "NOT_FOUND") {
      throw new CustomError(
        res.data.errors[0].message || "Could not fetch user.",
        CustomError.USER_NOT_FOUND,
      );
    }
    if (res.data.errors[0].message) {
      throw new CustomError(
        wrapTextMultiline(res.data.errors[0].message, 90, 1)[0],
        res.statusText,
      );
    }
    throw new CustomError(
      "Something went wrong while trying to retrieve the language data using the GraphQL API.",
      CustomError.GRAPHQL_ERROR,
    );
  }

  let repoNodes = res.data.data.user.repositories.nodes;
  /** @type {Record<string, boolean>} */
  let repoToHide = {};
  const allExcludedRepos = [...exclude_repo, ...excludeRepositories];

  // populate repoToHide map for quick lookup
  // while filtering out
  if (allExcludedRepos) {
    allExcludedRepos.forEach((repoName) => {
      repoToHide[repoName] = true;
    });
  }

  // filter out repositories to be hidden
  repoNodes = repoNodes
    .sort((a, b) => b.size - a.size)
    .filter((name) => !repoToHide[name.name]);

  let repoCount = 0;

  repoNodes = repoNodes
    .filter((node) => node.languages.edges.length > 0)
    // flatten the list of language nodes
    .reduce((acc, curr) => curr.languages.edges.concat(acc), [])
    .reduce((acc, prev) => {
      // get the size of the language (bytes)
      let langSize = prev.size;

      // if we already have the language in the accumulator
      // & the current language name is same as previous name
      // add the size to the language size and increase repoCount.
      if (acc[prev.node.name] && prev.node.name === acc[prev.node.name].name) {
        langSize = prev.size + acc[prev.node.name].size;
        repoCount += 1;
      } else {
        // reset repoCount to 1
        // language must exist in at least one repo to be detected
        repoCount = 1;
      }
      return {
        ...acc,
        [prev.node.name]: {
          name: prev.node.name,
          color: prev.node.color,
          size: langSize,
          count: repoCount,
        },
      };
    }, {});

  Object.keys(repoNodes).forEach((name) => {
    // comparison index calculation
    repoNodes[name].size =
      Math.pow(repoNodes[name].size, size_weight) *
      Math.pow(repoNodes[name].count, count_weight);
  });

  const topLangs = Object.keys(repoNodes)
    .sort((a, b) => repoNodes[b].size - repoNodes[a].size)
    .reduce((result, key) => {
      result[key] = repoNodes[key];
      return result;
    }, {});

  return topLangs;
};

export { fetchTopLanguages };
export default fetchTopLanguages;
