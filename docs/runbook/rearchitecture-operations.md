# Rearchitecture Operations Runbook

## 1. Scope
- This runbook covers the rearchitecture release gate for:
- `schema governance`
- `state migration contract`
- `scoring stability`
- `golden replay`
- `cron reliability`

## 2. Incident Levels
1. `SEV-0`
- Any hard gate broken (`No-Go`), or scoring pipeline cannot run.
- Action: stop rollout immediately.

2. `SEV-1`
- Score output is available, but one or more required metrics are `not_collected`.
- Action: block promotion, open data collection fix.

3. `SEV-2`
- Metrics collected, but below threshold.
- Action: keep rollout frozen, assign owner and remediation window.

## 3. Immediate Checks
1. Runtime schema/version
- Command:
```bash
tsx scripts/rearchitecture/score-runtime-window.ts --work-dir=.mimikit --window-type=daily --from=2026-03-07 --to=2026-03-07
```
- Pass condition:
- command exits `0`
- result JSON includes `version`, `governance`, `status`

2. Golden replay
- Command:
```bash
tsx scripts/rearchitecture/replay-golden-set.ts --work-dir=.mimikit --golden-set=overflows/golden-set-example.json
```
- Pass condition:
- command exits `0`
- JSON includes `goldenReplayMatchRate` and `replayDeterminismRate`

## 4. Manual Takeover Triggers
1. Trigger manual takeover when:
- scoring script exits non-zero
- `status=unstable` with `not_collected` blockers
- replay command exits non-zero

2. Manual takeover actions:
- freeze release branch
- preserve raw outputs in incident record
- assign owners for missing metric collection

## 5. Rollback Criteria
1. Roll back when:
- schema migration causes runtime load failure
- replay match rate drops below gate unexpectedly
- any cron reliability gate is violated in release window

2. Rollback execution:
- revert release candidate commit range
- restore last known stable runtime snapshot backup
- rerun scoring/replay checks on previous baseline

## 6. Postmortem Template
1. Incident metadata
- date
- owner
- severity
- impacted release window

2. What failed
- failed command
- failing metric(s)
- first observed timestamp

3. Root cause
- data collection gap / migration defect / logic regression / environment fault

4. Corrective actions
- immediate fix
- prevention control
- validation command output link

5. SLA
- SEV-0: mitigation within 2 hours
- SEV-1: mitigation within 24 hours
- SEV-2: mitigation within 72 hours

## 7. Oncall Rotation
1. Rotation cadence
- weekly rotation, every Monday 10:00 (team local time)
- primary owner handles gate execution and first response
- secondary owner handles takeover and audit backup

2. Handover checklist
- latest `score-runtime-window` output path
- latest `replay-golden-set` output path
- latest migration rehearsal output path
- unresolved blockers (`not_collected` / threshold violations)
- rollback decision and commit range if any

3. Escalation rules
- SEV-0: page primary + secondary immediately, notify release owner
- SEV-1: notify primary within 10 minutes, secondary within 30 minutes
- SEV-2: create ticket and assign next business-day owner

## 8. Shift Handover Template
```markdown
Shift: {primary} / {secondary}
Window: {from}..{to}

Gate status:
- scoring: stable|unstable
- replay: pass|fail
- migration rehearsal: pass|fail
- cron reliability: pass|fail

Evidence:
- score report: {path}
- replay report: {path}
- migration report: {path}

Blockers:
- P0: ...
- P1: ...

Next actions:
1. ...
2. ...
```
