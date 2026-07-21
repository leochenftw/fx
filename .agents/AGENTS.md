# Project Architecture & Style Guidelines

This repository follows strict modularization, type safety, and sovereign database conventions. Future code edits, file organization, and architectural designs MUST adhere to the following guidelines:

---

## 1. Modular TypeScript Type Organization
Monolithic and oversized `types.ts` files are forbidden. All TypeScript type definitions must be organized hierarchically and stored under the `frontend/src/types/` directory:
- **Core Domain Entities (`types/domain.ts`)**: Defines database/API domain models shared across components (e.g., `Organisation`, `BankAccount`, `StaffDetails`, `StaffMember`).
- **Common Component Props (`types/props.ts`)**: Defines React Props for globally reused base UI components.
- **Business Module Props (`types/modules/<name>.ts`)**: Organizes specific React Props for forms, lists, and pages grouped by their business subdomain (e.g., `auth.ts`, `org.ts`, `staff.ts`).
- **Import Style**: When referencing types, components and pages should import them as type-only declarations: `import type { ... } from '...'`.

---

## 2. Authentication & Token Management
- **Single-flight Promise**: When calling the AWS Cognito API to retrieve or refresh tokens, the client must use the `pendingTokenPromise` single-flight pattern (refer to the `getValidToken` implementation in `App.tsx`).
- **Prevent Refresh Race Conditions**: If multiple API requests are launched concurrently and the token has expired, all subsequent requests must reuse the same initial `refreshPromise`. Sending multiple concurrent `REFRESH_TOKEN_AUTH` requests is strictly prohibited.
- **Unified API Client Standard**: All frontend HTTP requests must utilize the client instance exported from `frontend/src/api/client.ts` (e.g., `api.get`, `api.post`). Do not write manual `fetch` calls or inline `getValidToken` lookups inside components. New API routes must be grouped under `frontend/src/api/` as modular managers (e.g., `orgs.ts`, `staff.ts`, `config.ts`).

---

## 3. Page Layout & UI Theme
- **Global Layout Isolation**: Router pages (such as `/settings`, `/staff`, etc.) must only render the main card contents. The left global `Sidebar`, top `Header`, and bottom `Footer` are managed and rendered by the outer `AppLayout`. Individual pages must not redraw these global layout containers.
- **Main Canvas Design Tokens**:
  - Main container wraps in: `space-y-6 w-full max-w-[1280px]`.
  - Cards should use white containers with subtle borders and shadows: `bg-white border border-slate-200 rounded-2xl shadow-sm p-5`.
  - Font sizes must align to specifications (e.g., page header 24px, card title 14px bold).

---

## 4. Communication & Coding Rules
- **Language Policy**: Frontend/backend user interfaces, buttons, application logs, and code comments must be written in **English**. Human-to-human communications, implementation plans, checklists/tasks, and walkthrough walkthroughs must be written in **Chinese**.
- **Type Safety**: Any feature development or codebase refactoring must guarantee zero TypeScript compiler errors (`npm run build` and backend `tsc` must pass cleanly).

---

## 5. Commercial Deployment & Architecture Guidelines
- **Business Deployment Model**: The system is designed for a **Managed Remote Deployment (远程代部署)** commercial model.
- **Client Zero-Prerequisite Guarantee**: Clients/buyers are non-technical end users. They DO NOT need Node.js, AWS CLI, or local build environments.
- **Remote Deployment Pipeline**: Deployments to client AWS accounts are performed remotely from the developer/operator's environment using client-provided AWS credentials (IAM Access Keys or Cross-Account IAM Roles).
- **Automated Frontend Build & S3 Deploy via CDK**: During `cdk deploy`, CDK MUST automatically trigger frontend compilation (`npm run build`), dynamically inject backend resource endpoints (Lambda URL, UserPool ID, S3 Bucket names), and sync the compiled static bundle (`dist/`) into the target client S3 bucket via `s3deploy.BucketDeployment`. Clients receive a 100% ready-to-use application URL without manual frontend steps.
- **Entry Point URL & Client Delivery**: Upon `cdk deploy` completion, CDK MUST export and print the final application entry URL (`AppUrl` via `CfnOutput` and `./scripts/post-deploy.js`). This entry URL is the primary deliverable provided to the client for immediate browser access.
- **Tax Invoice Compliance & Archiving**: Original invoice attachments (PDFs/Images) uploaded via `/bills` must be archived permanently in private S3 buckets (`s3://.../orgs/{orgId}/bills/`) to satisfy NZ IRD / AU ATO 7-year tax audit compliance. Frontend previews utilize 15-minute S3 Presigned URLs.
