# Claude Code rules for focus-music-dev (iOS Safari player)

NON-NEGOTIABLES
- Do NOT modify any existing desktop playback code or desktop ABR ladder logic.
- All iOS Safari playback work must be isolated under: src/player/iosSafari/
- Only ONE routing file outside that folder may be modified (e.g. src/player/index.ts).
- If you think you need to touch any other file, STOP and ask before proceeding.

WORKFLOW
- Make small, atomic commits.
- Run build/lint/test after each major step and fix failures.
- Provide iOS Safari on-device test steps at the end.
