# Frontend development

Use both `apple-design` and `emil-design-eng` for frontend building, refactoring, and UI review. Read their installed `SKILL.md` files before changing UI code. If a skill is unavailable, explain the limitation rather than claiming it was applied.

Prioritize clear hierarchy, immediate interaction feedback, stable layouts, accessible touch targets, and reduced-motion support. Frequent actions such as task completion must not wait for decorative animation or replace the entire list with a loading state. Preserve data on failed saves and provide a clear way to retry.

Review findings should use a `Before | After | Why` table. Validate changed interactions using isolated test data; do not write to the production Supabase database for UI tests.

Do not reintroduce Next.js middleware: the production EdgeOne runtime previously crashed with it. Users configure their own AI providers; do not introduce AI rate limiting.
