# Coding plan quota

Active Pi extension that adds quota information for the supported subscription/coding-plan providers to the existing editor prompt bar.

Supported sources:

- `llmapi`: `ANTHROPIC_BASE_URL` + `ANTHROPIC_AUTH_TOKEN`/`ANTHROPIC_API_KEY`, using `/v1/usage`
- OpenAI Codex: `openai-codex` OAuth credentials, using ChatGPT `wham/usage`
- Kimi Coding: `kimi-coding` OAuth/API credentials, using `/coding/v1/usages`
- GitHub Copilot: `github-copilot` OAuth/API credentials, using GitHub's authenticated Copilot quota endpoint

The extension polls all configured providers in parallel every 30 seconds. A missing or unsupported provider is omitted; a configured provider that fails displays `err` without breaking Pi. It never changes, re-enables, or imports the disabled extensions.
