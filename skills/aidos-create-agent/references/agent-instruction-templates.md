# Agent instruction templates

Super Agent copies/adapts these when drafting `instructionsBundle.files["AGENTS.md"]` for hire requests.

## Required sections in every hired agent AGENTS.md

1. **Role** — one-line purpose
2. **Responsibilities** — what this agent owns
3. **Recommend vs escalate** — when to create recommendations vs wake Super Agent
4. **Skills** — which domain skills apply (`aidos` always)
5. **Heartbeat behavior** — event-driven vs timer; inbox priority rules

## Template skeleton

```markdown
# {Display Name}

## Role
You are the {role} specialist for this organization.

## Responsibilities
- ...

## Recommend vs escalate
- Recommend: ...
- Escalate to Super Agent: ...

## Skills
- aidos (required)
- ...

## Heartbeat
Follow HEARTBEAT.md. Use tools only — no server shortcuts.
```

Per-role starting points: `agents/*.md`.
