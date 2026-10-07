# Working with Claude Code: sensitive values and delegated sessions

What we learned in October 2026 while using Claude Code for security work on this repo. Read it
before handing a session a task that touches secrets, production, or access. This file lives in a
public repository: keep hostnames, addresses and account identifiers out of it.

## 1. What leaves the machine

Everything a session reads or a tool prints becomes part of the conversation, and the
conversation is processed on Anthropic's servers. That includes:

- any file the Read tool opens,
- the output of every shell command, including error messages that quote a connection string,
- anything pasted into the prompt.

So the rule is not "tell Claude to be careful". It is: **a secret the session never sees cannot
leak.** Design the task so the value is never needed in the conversation. Claude needs the *name*
of a variable, the *host* it points at, and the *result* of a command. It never needs the value.

## 2. Deny rules cover one door, not both

`permissions.deny` entries such as `Read(//**/.env.production)` in `~/.claude/settings.json`
stop the Read tool. They do not stop a shell command: `cat`, `sed`, `grep`, `source`, `node -e`
run through the Bash tool, which those rules do not inspect. We proved both in one session: the
Read call was refused, the `cat` went through to a permission prompt.

Close the second door with a PreToolUse hook on Bash that refuses any command naming an env
file. The one we use is `scripts/claude-hooks/block-env-files.py`; it allows only
`.env.example` and the migration wrapper below. Install it globally:

```bash
mkdir -p ~/.claude/hooks && cp scripts/claude-hooks/block-env-files.py ~/.claude/hooks/
```

```json
"hooks": {
  "PreToolUse": [
    { "matcher": "Bash",
      "hooks": [ { "type": "command", "command": "python3 -I ~/.claude/hooks/block-env-files.py" } ] }
  ]
}
```

The hook matches on command text. It stops every ordinary way of reading the file, not a
deliberately obfuscated one. The first line of defence is still **not having production env
files on a laptop at all**; the deny rules and the hook are the second.

Claude cannot make this change itself: editing its own settings is refused by the permission
classifier as self-modification. Expect the session to hand you the snippet instead.

## 3. Running migrations without showing the connection string

`scripts/db-migrate.sh <development|staging|production> <status|apply|sql>` is the only
thing that opens an env file:

```bash
scripts/db-migrate.sh production status
scripts/db-migrate.sh production apply 20261002_support_chat.sql --yes-production
scripts/db-migrate.sh production sql --yes-production
```

How it keeps the value out of the conversation:

- It reads the single `DIRECT_URL` line from `packages/db/.env.<env>` (or `apps/api/.env.<env>`)
  with `grep`, never `source`, so nothing else in the file reaches the child process.
- It prints `env= host= database= action=` and nothing more about the connection. That line is
  the "am I pointed at prod?" check, for you and for the session.
- Everything the child prints, stdout and stderr, passes through a filter that replaces the full
  connection string, the password, and any `user:password@` pattern.
- A write to production requires `--yes-production` in the command, so the intent is visible in
  the command the session runs, not in a prompt nobody reads.

Ask for migrations by environment and file name. The command you see should always start with
`scripts/db-migrate.sh`.

## 4. Secrets in code: what the sessions found

- **Never put a secret behind `NEXT_PUBLIC_`.** Those values compile into script files that the
  passcode middleware serves to anyone (`_next/static` is outside its matcher). A browser
  authenticates with its session cookie; anything that needs a secret goes through a server route.
- **Check every guard in the handler, not only in middleware.** The matcher skips paths with a
  dot, so a dynamic segment like `/api/admin/x/a.b` reaches the handler without it.
- **Compare secrets in constant time and log rejections** with the caller's address. A burst of
  rejections is the signal a log monitor turns into an incident.
- **A session cookie is a credential.** One deterministic value per passcode that lasts a week
  is a permanent key once it leaks. Issue a random token per login and let it expire.

## 5. Delegating a session

**Brief it like a ticket.** The shape that worked: *the job*, *the why*, *guardrails*, *done
means*. A session given "harden admin access, done means a PR to main" produced a mergeable PR;
a session given a vague goal produces a document about the goal.

**Give names, not values.** "Rotate `ADMIN_SECRET` on the API and admin apps" is a complete
instruction. The session never needs the value, and it will tell you which keys to change where
if you ask it to compare the code's env schema against `.env.example`.

**Say what it cannot see.** A session reads the repository. It cannot see Dokploy, GitHub
organisation settings, server configuration or the values in production env files, and it will
assume defaults for those unless told. Give it `gh` logged in when the task involves pull
requests or workflow state; without it, it cannot tell that the deploy workflows are disabled.

**Check open pull requests before starting a security task.** Two sessions, briefed separately,
produced the same admin fix in two PRs (#135 and #136). One branch per task, and a look at
`gh pr list` first, avoids the merge work.

**Ask what was verified and what was assumed.** A good session labels the two. Insist on it for
anything that ends in "the system is now secure": the code may be fixed on `dev` while production
runs last month's deploy.

**Keep security write-ups private.** Artifacts start private; a share link set to "anyone with
the link" on a page that lists open weaknesses is a disclosure. Share with named people.

**Review the PR as you would a human's.** A session's PR to money paths (deposit confirmation,
withdrawals) got a rebase, a test run and a read before merge, and the merge was done by a
person. The session's own test plan is a starting point, not a sign-off.

## 6. Checklist before a session touches anything sensitive

- [ ] Deny rules for env files and key material are in `~/.claude/settings.json`.
- [ ] The Bash hook from section 2 is installed.
- [ ] No production env file is on the laptop, or it holds only `DIRECT_URL` for the wrapper.
- [ ] The brief names variables and environments, never values.
- [ ] `gh auth status` shows a login if the task involves PRs or workflows.
- [ ] You know which environment any write targets, and production writes carry `--yes-production`.
- [ ] The resulting PR gets a human review before merge.
