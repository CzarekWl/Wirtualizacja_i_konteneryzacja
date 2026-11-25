# Code Review Guidelines

## General Rules
- All code comments and documentation must be written in English.
- Follow the existing project structure and coding conventions.
- Use TypeScript and pnpm.
- Avoid unnecessary complexity and dependencies.
- Check that changes meet the requirements of the related GitHub Issue.

## Security
- Never hardcode passwords, tokens, or credentials.
- Ensure `.env` files and secrets are not committed.
- Check for security vulnerabilities and unsafe configurations.
- Verify that user input is properly validated.

## Docker and Infrastructure
- Check Docker Compose configurations, healthchecks, and volumes.
- Verify that database migrations work correctly.
- Ensure sensitive data is handled securely.
- Avoid configurations that could accidentally delete persistent data.

## PostgreSQL
- Check SQL queries and migrations for correctness.
- Verify proper error handling and parameterized queries.
- Identify potential data integrity issues.

## RabbitMQ
- Verify message acknowledgments and persistence.
- Check retry and dead-letter queue behavior.
- Identify possible message loss, duplicate processing, or infinite retry loops.

## Code Quality and Testing
- Check for logical errors and edge cases.
- Verify that important functionality is covered by tests.
- Identify breaking changes and missing error handling.
- Prioritize correctness, reliability, and security over stylistic preferences.

## Review Behavior
- Only review code; do not modify files.
- Do not create commits, branches, or Pull Requests.
- Never merge Pull Requests.
- Report issues with file paths, line numbers, and clear explanations.
- Prioritize critical and high-impact problems.
- Do not report speculative issues without reasonable evidence.
- If no significant issues are found, state that clearly.
