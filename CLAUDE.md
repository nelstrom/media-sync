# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands
- Development: `npm run dev` (runs Vite dev server)
- Build: `npm run build` (builds for production)
- Preview: `npm run preview` (previews production build)
- Tests: `npm run test` (runs Vitest tests)
- Single test: `npm run test -- path/to/test.spec.ts`

## Code Style Guidelines
- TypeScript with strict type checking enabled
- 2-space indentation, Unix line endings
- Single quotes for strings, semicolons required
- Web Components standards for custom elements
- Modular code organization with functionality in classes/modules
- Clear, descriptive class and variable names
- Strong typing with explicit return types
- Error handling with try/catch and appropriate logging

## Project Architecture
- Main custom element named `media-sync`
- Code in `src/` directory, built output in `dist/`
- Modules should either:
  - Export backing class as default export
  - Self-register in custom elements registry