# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is the **AWS Generative AI Use Cases (GenU)** project - a Well-Architected application that implements business use cases using AWS Generative AI services. It's an AWS sample project published under MIT license.

## Common Development Commands

### Setup and Development

```bash
# Install dependencies (use ci for clean install)
npm ci

# Start web development with environment setup
npm run web:devw       # macOS/Linux
npm run web:devww      # Windows

# Start browser extension development
npm run extension:dev
```

### Testing and Linting

```bash
# Run all tests
npm run test

# Run specific tests
npm run cdk:test              # CDK tests
npm run web:test              # Frontend tests
npm run cdk:test:update-snapshot  # Update CDK snapshots

# Run linting (includes Prettier and ESLint)
npm run lint

# Test a single file (from packages/cdk or packages/web)
npm test -- path/to/test/file.test.ts
```

### Building and Deployment

```bash
# Build web application
npm run web:build

# Deploy to AWS (regular)
npm run cdk:deploy

# Deploy quickly (skip checks, parallel deployment)
npm run cdk:deploy:quick

# Deploy with hotswap (for Lambda changes)
npm run cdk:deploy:quick:hotswap

# Destroy all resources
npm run cdk:destroy
```

## Architecture Overview

### Monorepo Structure
- Uses npm workspaces
- Main packages: `cdk`, `web`, `types`, `common`
- Browser extension as separate module

### Frontend (`/packages/web`)
- **Stack**: React 18 + TypeScript + Vite
- **Styling**: Tailwind CSS with custom components
- **State**: Zustand for state management, SWR for data fetching
- **Auth**: AWS Amplify with Cognito
- **i18n**: Supports Japanese, English, Korean (translations in `/public/locales/`)
- **Key Libraries**: Novel editor, Tiptap, React Router, Radix UI

### Backend (`/packages/cdk`)
- **Infrastructure**: AWS CDK v2
- **Runtime**: Node.js Lambda functions (TypeScript)
- **Database**: DynamoDB
- **AI/ML**: Amazon Bedrock, Kendra, Knowledge Base
- **API**: API Gateway with WebSocket support
- **Storage**: S3 with CloudFront

### Key Patterns

1. **Lambda Function Structure**
   - Located in `/packages/cdk/lambda/`
   - Each use case has its own directory
   - Common utilities in `/packages/cdk/lambda/utils/`
   - Use AWS SDK v3 clients

2. **Frontend Components**
   - Components in `/packages/web/src/components/`
   - Pages in `/packages/web/src/pages/`
   - Hooks in `/packages/web/src/hooks/`
   - API calls use `/packages/web/src/apis/`

3. **Type Safety**
   - Shared types in `/packages/types/`
   - Use Zod for runtime validation
   - Strict TypeScript configuration

4. **Testing Approach**
   - CDK: Jest with snapshot testing
   - Web: Vitest for unit tests
   - Test files co-located with source

5. **Environment Configuration**
   - Use `setup-env.sh` for local development
   - CDK context in `cdk.json`
   - Environment variables prefixed with `VITE_` for frontend

## Important Conventions

1. **Multi-language Support**
   - All user-facing text must support i18n
   - Use `useTranslation` hook in React components
   - Translation keys follow hierarchical naming

2. **Error Handling**
   - Lambda functions return structured error responses
   - Frontend shows user-friendly error messages
   - Log errors for debugging but don't expose internals

3. **Security**
   - Never commit secrets or API keys
   - Use IAM roles for AWS service access
   - Validate all inputs on both frontend and backend

4. **Deployment Options**
   - Support for VPC/private network deployment
   - SAML authentication option
   - WAF integration available
   - Use case feature flags in CDK context