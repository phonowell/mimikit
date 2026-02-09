Review recent user-assistant conversation snippets and extract only high-value issues.

Return actions only, each in one line:
@capture_feedback message="..."

Rules:
- Ignore emotional-only statements with no actionable value.
- Prefer issues with repeated evidence, high cost, high latency, or failures.
- If no valuable issue exists, return empty output.
