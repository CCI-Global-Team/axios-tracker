/** Types for index.mjs. Hand-written: the module is plain JS so it runs with no build step. */

export type Logger = (...args: unknown[]) => void;

export interface TransitionConfig {
  /** Axios origin. Default: AXIOS_HOST, else https://axios.joincci.org. */
  host?: string;
  /** Workspace slug. Default: AXIOS_WORKSPACE, else "cci". */
  workspace?: string;
  /** Axios Bot API token. Default: AXIOS_BOT_TOKEN. Present-but-undefined means no token. */
  token?: string | undefined;
  /** GitHub token. Default: GITHUB_TOKEN. Present-but-undefined means no token. */
  githubToken?: string | undefined;
  /** Where decisions are logged. Default: console.log. */
  log?: Logger;
}

export interface MoveDecision {
  move: boolean;
  why?: string;
}

export interface Reviewer {
  login: string;
}

export interface Review {
  state: string;
  user?: { login?: string } | null;
}

export interface PullRequestLike {
  draft?: boolean;
  requested_reviewers?: Reviewer[];
}

/** GitHub webhook payload. Only the fields this module reads are named. */
export type GitHubEvent = Record<string, any>;

/** A broken token or an unreachable Axios: the only failures worth a red X. */
export class FatalError extends Error {}

/** Replaces earlier configure() calls; configure({}) returns to the environment. */
export function configure(options?: TransitionConfig): void;

export function shouldMove(current: string, target: string, options?: { review?: boolean }): MoveDecision;

export function outstandingChangeRequests(reviews: Review[], requestedReviewers?: Reviewer[]): string[];

export function reviewTarget(pr: PullRequestLike, reviews: Review[]): "In Progress" | "Ready for Review";

export function shouldHandle(name: string, event: GitHubEvent): boolean;

export function handleEvent(name: string, event: GitHubEvent, repo: string, options?: TransitionConfig): Promise<void>;
