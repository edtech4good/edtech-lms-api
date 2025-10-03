# Contributing to EdTech LMS API

Thank you for your interest in contributing to the EdTech LMS API! This document provides guidelines and information for contributors.

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- MySQL database
- Git

### Development Setup

1. Fork the repository
2. Clone your fork: `git clone https://github.com/your-username/edtech-lms-api.git`
3. Install dependencies: `npm install`
4. Copy the example environment file: `cp env.example .env`
5. Configure your environment variables in `.env`
6. Set up your MySQL database
7. Run database migrations: `npm run db:migrate`
8. Start the development server: `npm run start:dev`

## Code Style

This project uses:
- ESLint for code linting
- Prettier for code formatting
- TypeScript for type safety

### Running Linting and Formatting

```bash
# Run linting
npm run lint

# Format code
npm run format
```

## Testing

```bash
# Run tests
npm test

# Run tests with coverage
npm run test:cov
```

## Database Migrations

When making database changes:

1. Create a new migration file: `npx sequelize-cli migration:generate --name your-migration-name`
2. Write your migration in the generated file
3. Test the migration: `npm run db:migrate`
4. If needed, create a rollback: `npx sequelize-cli migration:generate --name rollback-your-migration-name`

## Pull Request Process

1. Create a feature branch from `main`
2. Make your changes
3. Add tests for new functionality
4. Ensure all tests pass
5. Run linting and fix any issues
6. Update documentation if needed
7. Submit a pull request

### Pull Request Guidelines

- Use clear, descriptive commit messages
- Keep pull requests focused on a single feature or bug fix
- Include tests for new functionality
- Update documentation as needed
- Ensure your code follows the project's style guidelines

## Issue Reporting

When reporting issues, please include:

- Clear description of the problem
- Steps to reproduce
- Expected vs actual behavior
- Environment details (OS, Node.js version, etc.)
- Relevant error messages or logs

## Security

If you discover a security vulnerability, please do not open a public issue. Instead, please contact the maintainers privately.

## License

By contributing to this project, you agree that your contributions will be licensed under the MIT License.

## Questions?

If you have questions about contributing, please open an issue or contact the maintainers.
