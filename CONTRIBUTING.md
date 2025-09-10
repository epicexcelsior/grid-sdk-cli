# Contributing to Grid SDK CLI Tool

Thank you for your interest in contributing to the Grid SDK CLI Tool! This document outlines the process for contributing to this project.

## Getting Started

1. Fork the repository
2. Clone your fork locally
3. Install dependencies: `npm install`
4. Copy `.env.example` to `.env` and configure your API keys
5. Test your setup: `npm start`

## Development Workflow

1. Create a new branch for your feature: `git checkout -b feature/your-feature-name`
2. Make your changes
3. Test thoroughly with both sandbox and production environments
4. Ensure code follows the existing style and patterns
5. Update documentation if needed
6. Submit a pull request

## Code Standards

- Use TypeScript with proper typing
- Follow existing code style and patterns
- Add input validation for user inputs
- Use the debug/simple logging pattern consistently
- Handle errors gracefully
- Add comments for complex logic

## Testing

- Test all features in both sandbox and production environments
- Verify error handling works correctly
- Test with invalid inputs to ensure validation works
- Check that debug mode shows appropriate information

## Security Guidelines

- Never commit API keys or sensitive data
- Always validate user inputs
- Use environment variables for configuration
- Follow secure coding practices
- Report security issues privately

## Pull Request Guidelines

1. Provide a clear description of changes
2. Reference any related issues
3. Include screenshots for UI changes
4. Ensure all checks pass
5. Update documentation as needed
