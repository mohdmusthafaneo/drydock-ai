---
name: charcoal
description: Work with stacked branches and pull requests using the Charcoal CLI (`ch`). Use when the user mentions Charcoal, stacked PRs, stacked branches, branch stacks, Graphite migration, `ch create`, `ch submit`, `ch restack`, `ch sync`, or wants to split work into dependent PRs.
---

# Charcoal — Stacked PRs

Charcoal is an open-source fork of Graphite for stacked branches and PRs on GitHub. The command is **`ch`** (also installed as `charcoal`). Docs: [Charcoal command reference](https://github.com/danerwilliams/charcoal/blob/main/DOCUMENTATION.md).

**Migrating from Graphite?** Charcoal uses a flat CLI: `ch create`, `ch submit`, `ch sync` replace `gt branch create`, `gt stack submit`, etc. Alias: `alias gt=ch`.

## Concepts

| Term | Meaning |
|------|---------|
| **Stack** | Chain of dependent branches, each based on the one below |
| **Trunk** | Base branch (e.g. `main`) — every stack starts here |
| **Downstack** | Ancestors toward trunk (parent branches) |
| **Upstack** | Descendants away from trunk (child branches) |
| **Restack** | Rebase affected branches onto their parent to keep the stack consistent |

## First-time setup

```bash
ch auth                    # authenticate via GitHub CLI
ch init --trunk main       # or: ch repo init --trunk main
ch ls                      # verify tracked stacks
```

## Core workflows

### Start a new stacked branch

```bash
git add -A
ch create -m "Add login form"          # auto-named branch from message
ch create my-feature -m "Add login form"  # explicit name
```

Use `-a` to stage all changes, `-i` to insert a branch (existing children become children of the new branch).

### Amend or add commits on current branch

```bash
ch modify -a                  # amend current commit with staged/all changes
ch modify -c -m "Fix typo"    # new commit instead of amend
```

`modify` restacks upstack branches automatically.

### Submit PRs

```bash
ch submit                     # trunk → current branch (downstack only)
ch submit --stack             # include descendants too
ch submit --stack -d          # whole stack as drafts
ch submit --dry-run           # preview without pushing
```

- Default scope is **downstack** (trunk → current). Pass `--stack` to also submit descendants.
- Creates/updates one PR per branch. Uses `--force-with-lease` by default.
- In non-interactive mode, new PRs default to draft.

### Keep stack in sync with remote trunk

```bash
ch sync                       # pull trunk, delete merged branches
ch sync -fr                   # force + restack after sync
```

### Rebase stack after parent changes

```bash
ch restack                    # full stack from current branch
ch restack --upstack          # current + descendants only
ch restack --downstack        # current + ancestors only
```

Prefer `ch restack` over manual `git rebase` — Charcoal updates metadata and descendants.

### Navigate the stack

```bash
ch ls                         # all stacks (short)
ch co                         # interactive checkout
ch up / ch down               # move one level in stack
ch top / ch bottom            # tip or base of current stack
ch info -d                    # diff vs parent branch
```

### Resolve conflicts during restack/sync

```bash
# fix conflicts in files, then:
git add <resolved-files>
ch continue -a
```

### Split work into smaller stacked PRs

```bash
ch split --by-commit          # one branch per commit
ch split --by-hunk            # one branch per hunk
```

### Fold or delete branches

```bash
ch fold                       # merge current branch into parent
ch delete old-branch -f       # delete branch + metadata
ch pop                        # delete current branch, keep working tree
```

### Pull a teammate's stack

```bash
ch get teammate-branch        # fetch trunk → branch from remote
```

## Agent rules

When helping with stacked PR workflows:

1. **Use `ch`, not `gt`** — Graphite commands are obsolete in Charcoal.
2. **Prefer Charcoal over raw git** for stack operations (`restack`, `modify`, `submit`, `sync`) so parent/child metadata stays correct.
3. **Use `--no-interactive`** when running Charcoal in scripts or CI.
4. **Inspect before acting**: run `ch ls` or `ch info` to understand stack state.
5. **Submit scope**: `ch submit` without `--stack` only covers downstack; remind the user if they want the full stack published.
6. **Do not rename** branches with open PRs unless the user accepts losing PR association (`ch rename` removes linked PRs).
7. **Track untracked branches** with `ch track -p main` or `ch track --downstack`.
8. **Test across stack**: `ch test "npm test"` or `ch test --upstack "npm run lint"`.

## Global flags (all commands)

| Flag | Use |
|------|-----|
| `--no-interactive` | Scripts/CI — disable prompts |
| `-q`, `--quiet` | Minimal output |
| `--no-verify` | Skip git hooks (only when user requests) |
| `--debug` | Verbose debug output |

## Additional resources

- Full command reference: [reference.md](reference.md)
- Upstream docs: https://github.com/danerwilliams/charcoal/blob/main/DOCUMENTATION.md
