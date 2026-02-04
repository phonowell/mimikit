# Notes: status dot animation + task elapsed timer

- Tasks API returns TaskView with createdAt only; no duration/startedAt/completedAt
- tasks list re-renders every 5s; needs separate 1s timer for real-time elapsed
- Added ./src/webui/tasks-view.js to keep tasks panel logic under 200 lines
