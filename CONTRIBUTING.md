# Contributing to Flow DCA

Thank you for your interest in contributing to Flow DCA! This document provides guidelines and instructions for contributing.

## Getting Started

### Prerequisites

- [Flow CLI](https://developers.flow.com/tools/flow-cli/install) v1.0+
- [Node.js](https://nodejs.org/) v18+
- Git

### Development Setup

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/dcatoken.git
   cd dcatoken
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Copy environment template:
   ```bash
   cp .env.example .env
   ```
5. Start development server:
   ```bash
   npm run dev
   ```

## How to Contribute

### Reporting Bugs

1. Check existing issues to avoid duplicates
2. Create a new issue with:
   - Clear, descriptive title
   - Steps to reproduce
   - Expected vs actual behavior
   - Environment details (OS, browser, Flow CLI version)

### Suggesting Features

1. Open an issue with the `enhancement` label
2. Describe the feature and its use case
3. Explain why it would benefit other users

### Submitting Pull Requests

1. Create a feature branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```
2. Make your changes following our code style
3. Test thoroughly on testnet
4. Commit with clear messages:
   ```bash
   git commit -m "feat: add new feature description"
   ```
5. Push and create a PR against `main`

## Code Style

### Cadence (Smart Contracts)

- Follow [Cadence 1.0 best practices](https://cadence-lang.org/docs/)
- Use explicit access modifiers (`access(all)`, `access(self)`)
- Add comments explaining complex logic
- Use `view` functions for read-only operations

### TypeScript (Frontend)

- Use TypeScript strict mode
- Follow existing patterns in the codebase
- Use meaningful variable names
- Add JSDoc comments for exported functions

### Commit Messages

We follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` - New features
- `fix:` - Bug fixes
- `docs:` - Documentation changes
- `refactor:` - Code refactoring
- `test:` - Adding tests
- `chore:` - Maintenance tasks

## Testing

Before submitting a PR:

1. Ensure the app builds: `npm run build`
2. Test on Flow Testnet
3. Verify all existing functionality still works

## Security

If you discover a security vulnerability:

1. **Do NOT** open a public issue
2. Email the maintainers directly
3. Allow time for a fix before public disclosure

## Questions?

- Open a [Discussion](https://github.com/onflow/dcatoken/discussions)
- Join the [Flow Discord](https://discord.gg/flow)

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
