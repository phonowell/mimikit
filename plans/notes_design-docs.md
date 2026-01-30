# Notes: design-docs

- User requested full revision of docs/design to address shortcomings/ambiguities.
- Must keep each markdown file ≤200 lines (optimize-docs skill).
- Assumption: scheduled triggers are one-shot and removed after firing.
- Clarified: conditional triggers create oneshot runs; task_done uses task_status + lastSeenResultId.
