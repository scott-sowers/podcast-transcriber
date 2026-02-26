import { Octokit } from "@octokit/rest";

export class GithubStore {
  private octokit: Octokit;

  constructor(
    private token: string,
    private owner: string,
    private repo: string,
    private branch?: string
  ) {
    this.octokit = new Octokit({ auth: token });
  }

  async resolveBranch(): Promise<string> {
    if (this.branch) return this.branch;
    const repo = await this.octokit.repos.get({
      owner: this.owner,
      repo: this.repo
    });
    this.branch = repo.data.default_branch;
    return this.branch;
  }

  async listPaths(prefix: string): Promise<Set<string>> {
    const branch = await this.resolveBranch();
    const ref = await this.octokit.git.getRef({
      owner: this.owner,
      repo: this.repo,
      ref: `heads/${branch}`
    });

    const commit = await this.octokit.git.getCommit({
      owner: this.owner,
      repo: this.repo,
      commit_sha: ref.data.object.sha
    });

    if (!commit.data.tree.sha) {
      return new Set();
    }

    const tree = await this.octokit.git.getTree({
      owner: this.owner,
      repo: this.repo,
      tree_sha: commit.data.tree.sha,
      recursive: "true"
    });

    const normalizedPrefix = prefix.endsWith("/") ? prefix : `${prefix}/`;
    return new Set(
      tree.data.tree
        .map((node) => node.path)
        .filter((path): path is string => Boolean(path))
        .filter((path) => path.startsWith(normalizedPrefix))
    );
  }

  async upsertJson(path: string, content: unknown, message: string): Promise<void> {
    const branch = await this.resolveBranch();
    const encoded = Buffer.from(JSON.stringify(content, null, 2) + "\n", "utf8").toString(
      "base64"
    );
    const sha = await this.getFileSha(path, branch);

    await this.octokit.repos.createOrUpdateFileContents({
      owner: this.owner,
      repo: this.repo,
      path,
      message,
      content: encoded,
      branch,
      sha
    });
  }

  async upsertText(path: string, content: string, message: string): Promise<void> {
    const branch = await this.resolveBranch();
    const encoded = Buffer.from(content, "utf8").toString("base64");
    const sha = await this.getFileSha(path, branch);

    await this.octokit.repos.createOrUpdateFileContents({
      owner: this.owner,
      repo: this.repo,
      path,
      message,
      content: encoded,
      branch,
      sha
    });
  }

  async getJson<T>(path: string): Promise<T | undefined> {
    const branch = await this.resolveBranch();

    try {
      const existing = await this.octokit.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path,
        ref: branch
      });

      if (Array.isArray(existing.data) || existing.data.type !== "file") {
        return undefined;
      }

      const decoded = Buffer.from(existing.data.content, "base64").toString("utf8");
      return JSON.parse(decoded) as T;
    } catch {
      return undefined;
    }
  }

  async getText(path: string): Promise<string | undefined> {
    const branch = await this.resolveBranch();

    try {
      const existing = await this.octokit.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path,
        ref: branch
      });

      if (Array.isArray(existing.data) || existing.data.type !== "file") {
        return undefined;
      }

      return Buffer.from(existing.data.content, "base64").toString("utf8");
    } catch {
      return undefined;
    }
  }

  private async getFileSha(path: string, branch: string): Promise<string | undefined> {
    try {
      const existing = await this.octokit.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path,
        ref: branch
      });
      if (!Array.isArray(existing.data) && existing.data.type === "file") {
        return existing.data.sha;
      }
      return undefined;
    } catch {
      return undefined;
    }
  }
}
