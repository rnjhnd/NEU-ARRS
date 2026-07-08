import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { RequestStatus } from '@prisma/client';
import { Redis } from "@upstash/redis";

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    // Vercel Cron sends an Authorization header with a secret
    const authHeader = request.headers.get('authorization');
    if (
      process.env.CRON_SECRET &&
      authHeader !== `Bearer ${process.env.CRON_SECRET}`
    ) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    // Ping Upstash Redis to prevent the free tier database from being paused/archived due to inactivity
    try {
      const isRateLimitingConfigured = !!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN;
      if (isRateLimitingConfigured) {
        const redis = new Redis({
          url: process.env.UPSTASH_REDIS_REST_URL || "",
          token: process.env.UPSTASH_REDIS_REST_TOKEN || "",
        });
        await redis.ping();
        console.log("Upstash Redis keepalive ping successful.");
      }
    } catch (e) {
      console.error("Upstash Redis keepalive ping failed:", e);
    }

    // Find all online requests stuck in PENDING_PAYMENT for more than 3 days
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    const staleRequests = await prisma.request.findMany({
      where: {
        paymentMethod: 'online',
        status: RequestStatus.PENDING_PAYMENT,
        createdAt: {
          lt: threeDaysAgo,
        },
      },
    });

    if (staleRequests.length === 0) {
      return NextResponse.json({ success: true, message: 'No stale requests found.' });
    }

    // Cancel them
    const updatedCount = await prisma.request.updateMany({
      where: {
        id: { in: staleRequests.map(r => r.id) }
      },
      data: {
        status: RequestStatus.CANCELLED,
        cancelReason: 'Payment window expired (auto-cancelled)',
      }
    });

    return NextResponse.json({ 
      success: true, 
      message: `Successfully cancelled ${updatedCount.count} stale requests.` 
    });
  } catch (error) {
    console.error('Error during cleanup cron job:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
