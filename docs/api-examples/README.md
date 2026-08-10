# API example payloads

Real Habitica API responses, for Claude (and you) to build against instead of guessing field shapes.

| File | Endpoint(s) | Source |
|---|---|---|
| `task-create-response.json` | `POST /tasks/user` | Habitica's own apidoc fixture |
| `tasks-list-response.json` | `GET /tasks/user` | Habitica's own apidoc fixtures (assembled from the `GetUserTasks` + `GetTask` examples to cover reward/daily/habit shapes in one file) |
| `task-tag-link-response.json` | `POST` / `DELETE /tasks/:taskId/tags/:tagId` | Habitica's own apidoc fixture |
| `score-task-response.json` | `POST /tasks/:taskId/score/:direction` | Habitica's own apidoc fixture (includes the item-drop variant) |
| `tags-response.json` | full `/tags` CRUD + `/reorder-tags` | Habitica's own apidoc fixtures |

**Provenance:** these are lifted verbatim from the `@apiSuccessExample` blocks in Habitica's own route source (`../vendor/tasks.controller.js`, `../vendor/tags.controller.js`) — not fabricated, not paraphrased. They're genuinely representative and stable, but they're old (~2017 IDs/timestamps) and don't reflect *your* actual data (your real tags, task counts, current level, etc.).

**Field shapes are current** — cross-checked directly against the live Mongoose schemas in `../vendor/task.model.js` and `../vendor/tag.model.js` (pulled from the `develop` branch) while assembling these files. Nothing here is stale on the field-name/type level, only on the specific values.

**To get fresh, personal examples:** run `./capture-fresh-examples.sh` with your own Habitica API credentials (from `habitica.com/user/settings/api`). It writes to `live/` (gitignored) and never sends your token anywhere but habitica.com. See the script's header comment for details — and note the instruction *not* to paste your API token into a chat session; the script is meant to run locally.
