import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { RequestStatus } from '@prisma/client';

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
