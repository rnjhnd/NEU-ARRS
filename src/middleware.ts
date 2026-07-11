import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Initialize Upstash Redis and Ratelimit only if keys are present
const isRateLimitingConfigured = !!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN;

const redis = isRateLimitingConfigured ? new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || "",
  token: process.env.UPSTASH_REDIS_REST_TOKEN || "",
}) : null;

const ratelimit = redis ? new Ratelimit({
  redis: redis,
  limiter: Ratelimit.slidingWindow(100, "10 s"),
  analytics: true,
  prefix: "@upstash/ratelimit",
}) : null;

const isPublicRoute = createRouteMatcher(["/", "/sign-in(.*)", "/sign-up(.*)", "/api/webhooks(.*)"]);

const isAdminRoute = createRouteMatcher(["/admin(.*)"]);

const isStudentRoute = createRouteMatcher(["/dashboard(.*)", "/receipt(.*)", "/api/student(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  // Only apply rate limiting to API routes or mutating requests (POST, PUT, DELETE, etc.)
  // This ensures that standard page navigation (GET requests) remains instantly snappy.
  const isApi = req.nextUrl.pathname.startsWith('/api');
  const isMutation = req.method !== 'GET';

  if (isRateLimitingConfigured && ratelimit && (isApi || isMutation)) {
    const ip = req.headers.get("x-forwarded-for") || "127.0.0.1";
    
    try {
      const { success, limit, reset, remaining } = await ratelimit.limit(ip);
      
      if (!success) {
        return new NextResponse("Too Many Requests - Rate limit exceeded. Please try again later.", {
          status: 429,
          headers: {
            "X-RateLimit-Limit": limit.toString(),
            "X-RateLimit-Remaining": remaining.toString(),
            "X-RateLimit-Reset": reset.toString(),
          },
        });
      }
    } catch (err) {
      console.error("Rate limiting error:", err);
      // If Redis fails, we allow the request through to prevent total outage
    }
  }

  if (isPublicRoute(req)) {
    return NextResponse.next();
  }

  // Protect all other routes
  await auth.protect();

  // Role-based access control for /admin
  if (isAdminRoute(req)) {
    const { sessionClaims } = await auth();
    const role = sessionClaims?.metadata?.role;
    
    if (role === "admin") {
      return;
    } else if (role === "employee") {
      const path = req.nextUrl.pathname;
      if (path === "/admin" || path.startsWith("/admin/students")) {
        return;
      }
      return NextResponse.redirect(new URL("/admin", req.url));
    } else {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
  }

  // Prevent staff from accessing the student portal
  if (isStudentRoute(req)) {
    const { sessionClaims } = await auth();
    const role = sessionClaims?.metadata?.role;
    if (role === "admin" || role === "employee") {
      return NextResponse.redirect(new URL("/admin", req.url));
    }
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
