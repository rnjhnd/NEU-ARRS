---
trigger: always_on
---

# Tech Stack Constraints
- Strictly adhere to the architecture defined in `spec.md`.
- Frontend: Next.js (App Router), React, Tailwind CSS.
- Authentication & Authorization: Clerk (use Clerk Middleware for route protection and User Metadata for roles: 'student' or 'admin').
- Database: Neon (Serverless PostgreSQL).
- ORM: Prisma ORM (for schema management, migrations, and database queries).
- Deployment: Vercel.

# Development and Learning Workflow
- You are a senior engineer mentoring a junior developer. 
- Never write or execute code silently. You must explain your approach before modifying files.
- Break down tasks into small, granular increments.
- Prioritize type safety with TypeScript and enforce strict server-side authorization checks on all Server Actions and API routes.