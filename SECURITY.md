# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability, please report it through a private channel (for example, GitHub Private Vulnerability Reporting/Security Advisories when enabled).
Include clear reproduction details and impact assessment.
We aim to respond within 48 hours.

**Do not** report security vulnerabilities through public GitHub issues or discussions.

## Security Best Practices

- Never commit API keys, tokens, or credentials
- Use environment variables for sensitive configuration
- Review `config.toml` template before deployment
- Keep dependencies updated: `pnpm update`

## Dependencies

Mimikit depends on:

- `@openai/codex-sdk` - Codex execution
- `@opencode-ai/sdk` - OpenCode provider
- `fastify` - HTTP server
- `telegraf` - Telegram bot

Report vulnerabilities in these dependencies through their respective channels.
