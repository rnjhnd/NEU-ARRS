import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { isServiceCronPath, rejectUnauthorizedCron } from "@/lib/cron-auth";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

let ratelimit: Ratelimit | undefined;
function getRateLimiter() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  // The service-authenticated cron path does not initialize or depend on Redis.
  return ratelimit ??= new Ratelimit({
    redis: new Redis({ url, token }), limiter: Ratelimit.slidingWindow(100, "10 s"),
    analytics: true, prefix: "@upstash/ratelimit",
  });
}

const isPublicRoute = createRouteMatcher(["/", "/sign-in(.*)", "/sign-up(.*)", "/sso-callback(.*)", "/api/webhooks(.*)"]);

const isAdminRoute = createRouteMatcher(["/admin(.*)"]);

const isStudentRoute = createRouteMatcher(["/dashboard(.*)", "/receipt(.*)", "/api/student(.*)"]);

const sessionMiddleware = clerkMiddleware(async (auth, req) => {
  // Only apply rate limiting to API routes or mutating requests (POST, PUT, DELETE, etc.)
  // This ensures that standard page navigation (GET requests) remains instantly snappy.
  const isApi = req.nextUrl.pathname.startsWith('/api');
  const isMutation = req.method !== 'GET';

  if (isApi || isMutation) {
    const ip = req.headers.get("x-forwarded-for") || "127.0.0.1";
    
    try {
      const limiter = getRateLimiter();
      const result = limiter ? await limiter.limit(ip) : null;
      
      if (result && !result.success) {
        const { limit, reset, remaining } = result;
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

export default function proxy(request: NextRequest, event: NextFetchEvent) {
  if (isServiceCronPath(request.nextUrl.pathname)) {
    return rejectUnauthorizedCron(request) ?? NextResponse.next();
  }
  return sessionMiddleware(request, event);
}

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
