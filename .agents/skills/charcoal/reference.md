# Charcoal command reference

Source: [danerwilliams/charcoal DOCUMENTATION.md](https://github.com/danerwilliams/charcoal/blob/main/DOCUMENTATION.md)

## Global options

| Flag | Description |
| --- | --- |
| `--interactive` / `--no-interactive` | Prompt the user. On by default; disable for scripts/CI. |
| `-q`, `--quiet` | Minimize output. |
| `--verify` / `--no-verify` | Run git hooks. On by default. |
| `--debug` | Debug output. |
| `--help` | Command help. |
| `--version` | Installed version. |

Environment: `CH_EDITOR`, `CH_PAGER`.

## Create & modify

### `create` (`c`)

Create a branch stacked on current; commit staged changes.

| Flag | Description |
| --- | --- |
| `[name]` | Branch name (auto-generated from `-m` if omitted). |
| `-m`, `--message` | Commit message. |
| `-a`, `--all` | Stage all before commit. |
| `-p`, `--patch` | Pick hunks to stage. |
| `-i`, `--insert` | Existing children become children of new branch. |

### `modify` (`m`)

Amend current commit (default) or add commit with `-c`; restacks upstack.

| Flag | Description |
| --- | --- |
| `-a`, `--all` | Stage all changes. |
| `-c`, `--commit` | New commit instead of amend. |
| `-m`, `--message` | Commit message. |
| `--edit` / `-n`, `--no-edit` | Edit message when amending. |
| `-p`, `--patch` | Pick hunks. |

### `squash` (`sq`)

Squash all commits on current branch into one; restack upstack.

### `edit` (`e`)

Interactive rebase on current branch; restack upstack.

### `split` (`sp`)

Split current branch into single-commit branches.

| Flag | Description |
| --- | --- |
| `-c`, `--by-commit` | Split by commit. |
| `-h`, `--by-hunk` | Split by hunk. |

### `fold`

Fold current branch into parent; restack descendants. `-k` keeps current branch name.

### `rename` (`rn`)

Rename branch and update metadata. **Removes associated GitHub PR.** `-f` allows rename with open PR.

### `delete` (`dl`)

Delete branch and Charcoal metadata. `-f` deletes unmerged branches.

### `pop`

Delete current branch; retain working tree state.

## Navigate

| Command | Alias | Description |
| --- | --- | --- |
| `checkout [branch]` | `co` | Switch branch; interactive if no arg. `-u` shows untracked. |
| `up [steps]` | `u` | Child branch (upstack). |
| `down [steps]` | `d` | Parent branch (downstack). |
| `top` | `t` | Tip of current stack. |
| `bottom` | `b` | First branch from trunk in stack. |

## Stack operations

### `restack` (`r`)

Rebase stack onto parents.

| Flag | Description |
| --- | --- |
| `--branch` | Branch to run from (default: current). |
| `-d`, `--downstack` | This branch + ancestors only. |
| `-u`, `--upstack` | This branch + descendants only. |
| `-o`, `--only` | This branch only. |

### `move [branch]` (`mv`)

Rebase current onto target; restack descendants. `--source` sets source branch.

### `reorder` (`ro`)

Reorder branches between trunk and current; interactive editor.

### `track [branch]` (`tr`)

Track branch with Charcoal; set parent. `-p` parent, `-f` force to tracked ancestor, `-d` track downstack chain.

### `untrack [branch]` (`ut`)

Stop tracking; untracks children too. `-f` no prompt.

### `test <command>`

Run command on each branch in stack. `-d` downstack, `-u` upstack, `-t` include trunk.

### `continue` (`cont`)

Continue after merge conflict. `-a` stage all.

## Submit & sync

### `submit`

Force-push branches and create/update PRs. Default: downstack (trunk → current).

| Flag | Description |
| --- | --- |
| `-s`, `--stack` | Also submit descendants. |
| `-d`, `--draft` | Draft PRs. |
| `-p`, `--publish` | Publish drafts. |
| `-e`, `--edit` / `-n`, `--no-edit` | Edit PR fields. |
| `-r`, `--reviewers` | Comma-separated reviewers. |
| `--dry-run` | Preview only. |
| `-c`, `--confirm` | Confirm before push. |
| `--select` | Choose which PRs to update. |
| `-u`, `--update-only` | Update existing PRs only. |
| `-f`, `--force` | Force push (default: `--force-with-lease`). |
| `--always` | Push even if unchanged. |
| `--branch` | Branch to run from. |

### `sync`

Pull trunk; delete merged branches. Overwrites trunk if not fast-forwardable.

| Flag | Description |
| --- | --- |
| `-p`, `--pull` | Pull trunk (default on). |
| `-d`, `--delete` | Delete merged branches (default on). |
| `-f`, `--force` | No prompts. |
| `-r`, `--restack` | Restack after sync. |

### `auth`

GitHub CLI auth. `-t` OAuth token.

## Collaborate

### `get [branch]` (`g`)

Fetch branches trunk → branch from remote. `-f` overwrite with remote.

## Inspect

| Command | Description |
| --- | --- |
| `log` / `log short` (`s`) | All tracked stacks. `-s` current stack, `-n` steps, `-u` untracked, `-r` reverse. |
| `ls` | Shortcut for `log short`. |
| `ll` | Shortcut for `log long` (commit ancestry graph). |
| `info` (`i`) | Current branch info. `-d` diff vs parent, `-p` per-commit patches, `-b` PR body. |

## Config

### `repo`

| Sub-command | Description |
| --- | --- |
| `repo init` (`i`) | `.graphite_repo_config`. `--trunk`, `--reset`. |
| `repo sync` (`s`) | Same as top-level `sync`. |
| `repo name` / `owner` / `remote` | Repo metadata. `-s`/`--set` to write. |
| `repo pr-templates` | List GitHub PR templates. |
| `repo github` | Toggle GitHub integration. `--enable`. |

### `user`

| Sub-command | Description |
| --- | --- |
| `user editor` | `--set`, `--unset`. |
| `user pager` | `--set`, `--disable`, `--unset`. |
| `user tips` | `--enable`, `--disable`. |
| `user branch-prefix` | `-s`/`--set`, `-r`/`--reset`. |
| `user branch-date` | `--enable`, `--disable`. |
| `user branch-replacement` | `--set-underscore`, `--set-dash`, `--set-empty`. |
| `user restack-date` | `--use-author-date`. |
| `user submit-body` | `--include-commit-messages`. |

## Setup & misc

| Command | Description |
| --- | --- |
| `init` | Same as `repo init`. |
| `completion` | Bash/zsh completion script. |
| `fish` | Fish shell completion. |
| `feedback debug-context` | Debug summary for bug reports. |
| `demo` | Interactive demo. |
