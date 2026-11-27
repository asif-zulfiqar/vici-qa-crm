# How we work on tasks

Each task file in this folder is one unit of work. For every task:

1. Read `CLAUDE.md`, `docs/PROJECT_CONTEXT.md` and the task file.
2. Reply with a plan: files you will create or change, libraries you will add (with one line
   on why), and anything unclear. Wait for my OK before writing code.
3. Build in small steps. After each step run `npm run typecheck` (and `npm test` once tests
   exist) and fix every error before moving on.
4. When done, give me: a short summary of what was built and why, the exact commands I should
   run to check it myself, what the correct output looks like, and a suggested commit message.
5. Never print, log or commit secrets from `.env`. Never put real customer data in code,
   tests or fixtures.
6. If the current docs of a library differ from what the task says, follow the current docs
   and tell me what you changed.
7. Never commit, push, create branches or switch branches. Leave the changes in the working
   tree and give me the suggested commit message; I review, commit and push myself.
   (Added 26 Nov after Task 04 Step 1 was committed on a new branch.)
8. Task files are a record we learn from. When a plan changes, add a dated note next to the
   old text ("Changed on 26 Nov: ..."). Never delete the old text.
