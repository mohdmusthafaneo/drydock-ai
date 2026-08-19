# QA Ticket Agent Protocol

1. Pick ONE `QA Failed` ticket from `qa-onboarding/TICKETS.csv`. Read its `status_reason` — it describes exactly what is broken.
2. Create an isolated git worktree: `git worktree add ../aidos-tkt{NNN} dev` (use ticket ID as worktree name).
3. Branch off `dev`: `git checkout -b fix/tkt-NNN`.
4. Read the relevant source files — use `lsp` for symbol-aware work (renames, refs); use `grep`/`glob` for finding code.
5. Fix the code. Run `npx tsc --noEmit` on only the files you changed. Do NOT run full project build.
6. Commit with conventional message: `fix(tkt-NNN): description` or `feat(tkt-NNN): description`.
7. Push: `git push -u origin fix/tkt-NNN`.
8. Open browser tab `qa` (already authenticated as `connexus@neoito.com / Password@123`). Navigate to the affected URL. Verify the fix.
9. If QA passes: update that ONE row in `TICKETS.csv` — change `status` to `QA Verified`, overwrite `status_reason` with what you observed.
10. If QA fails: update `status_reason` to exactly what still fails, leave as `QA Failed`. Open a follow-up sub-task if needed.

**Rules:**
- One ticket per worktree; one worktree per branch.
- Update only the row you are working. Never batch-update other rows.
- After updating CSV, commit: `git add qa-onboarding/TICKETS.csv && git commit --amend --no-edit && git push`.
- Do NOT run `npm run build`; use `npx tsc --noEmit` only on changed files.
- Pre-existing project errors (`env.test.ts`, `agent-chat/index.test.ts`) are unrelated — ignore them.
