# Central draft import — User guide & manual test scenarios

## What changed

The library's **Central** drawer (Import from Central) now lists *every* form
in the chosen project, not just published ones:

- A form that has **never been published** appears as
  "*Form name* (unpublished)" and importing it pulls the form's **current
  draft** — definition and draft attachments.
- A **published** form imports its published version, exactly as before (even
  if the server also holds a newer draft of it).
- The empty-state message now reads "This project has no forms." — you only
  see it when the project is truly empty.

One behavioral difference to know about: importing an *unpublished* form does
**not** pre-fill the form's publish destinations (there is no publish history
to record). Importing a *published* form still seeds its origin server as a
tracked destination, as before.

## Manual test scenarios

1. **Draft-only project** (the original bug): connect to a server/project
   whose forms were uploaded but never published. The dropdown lists them all
   with the "(unpublished)" suffix. Pick one → Import → the form lands with
   its draft attachments and opens in the editor. Editor Central drawer shows
   no pre-seeded destination for it.
2. **Published form**: pick a form without the suffix → import → identical to
   pre-change behavior, including the seeded origin destination and freshness
   chip "Up to date".
3. **Mixed project**: both kinds listed together; suffix only on the
   never-published ones.
4. **Empty project**: dropdown shows "This project has no forms."
5. **Localization**: switch UI language to French/Spanish — suffix and notes
   render as "(non publié)" / "(sin publicar)".
