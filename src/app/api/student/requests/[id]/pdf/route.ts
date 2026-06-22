import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { clerkClient } from "@clerk/nextjs/server";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import QRCode from "qrcode";
import { format } from "date-fns";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const userId = await requireAuth();

    const request = await prisma.request.findUnique({
      where: { id: id },
    });

    if (!request) {
      return new NextResponse("Not Found", { status: 404 });
    }

    // Security check: Only the student or an admin can generate the PDF
    const client = await clerkClient();
    const viewingUser = await client.users.getUser(userId);
    const isAdmin = viewingUser.publicMetadata?.role === "admin";

    if (request.studentId !== userId && !isAdmin) {
      return new NextResponse("Unauthorized", { status: 403 });
    }

    if (request.status !== "COMPLETED") {
      return new NextResponse("Document is not yet completed and ready for generation.", { status: 400 });
    }

    // Fetch student details
    const student = await client.users.getUser(request.studentId);
    const studentName = `${student.firstName || ""} ${student.lastName || ""}`.trim() || "Student";
    
    const config = await prisma.documentConfig.findUnique({
      where: { typeId: request.documentType }
    });
    const documentLabel = config?.label || request.documentType.replace("_", " ");

    // 1. Create a new PDF document
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]); // A4 Size
    const { width, height } = page.getSize();

    // Embed fonts
    const fontTimesRoman = await pdfDoc.embedFont(StandardFonts.TimesRoman);
    const fontTimesBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
    const fontHelvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);

    // 2. Add NEU Header Mock
    page.drawText("NEW ERA UNIVERSITY", {
      x: width / 2 - 120,
      y: height - 100,
      size: 24,
      font: fontTimesBold,
      color: rgb(0.04, 0.36, 0.21), // #0A5C36 Dark Green
    });

    page.drawText("OFFICE OF THE UNIVERSITY REGISTRAR", {
      x: width / 2 - 145,
      y: height - 125,
      size: 14,
      font: fontTimesRoman,
      color: rgb(0, 0, 0),
    });

    page.drawText("No. 9 Central Ave, New Era, Quezon City, 1107 Metro Manila", {
      x: width / 2 - 165,
      y: height - 145,
      size: 11,
      font: fontTimesRoman,
      color: rgb(0.3, 0.3, 0.3),
    });

    // Divider Line
    page.drawLine({
      start: { x: 50, y: height - 170 },
      end: { x: width - 50, y: height - 170 },
      thickness: 1.5,
      color: rgb(0.04, 0.36, 0.21),
    });

    // 3. Document Title
    const titleWidth = fontTimesBold.widthOfTextAtSize(documentLabel.toUpperCase(), 20);
    page.drawText(documentLabel.toUpperCase(), {
      x: width / 2 - titleWidth / 2,
      y: height - 230,
      size: 20,
      font: fontTimesBold,
      color: rgb(0, 0, 0),
    });

    // 4. Body Content
    const currentDate = format(new Date(), "MMMM d, yyyy");
    
    page.drawText(`Date Issued: ${currentDate}`, { x: width - 200, y: height - 280, size: 12, font: fontTimesRoman });
    
    page.drawText("TO WHOM IT MAY CONCERN:", { x: 70, y: height - 320, size: 12, font: fontTimesBold });
    
    const bodyText = `This is to certify that ${studentName.toUpperCase()} has officially requested and fulfilled all requirements for the issuance of this ${documentLabel}. This document is issued upon the request of the individual for ${request.purpose.replace("_", " ").toLowerCase()} purposes.`;
    
    // Simple text wrapping (naive approach for mock)
    const words = bodyText.split(" ");
    let line = "";
    let yPosition = height - 360;
    for (let i = 0; i < words.length; i++) {
      const testLine = line + words[i] + " ";
      const testWidth = fontTimesRoman.widthOfTextAtSize(testLine, 12);
      if (testWidth > width - 140) {
        page.drawText(line, { x: 70, y: yPosition, size: 12, font: fontTimesRoman });
        line = words[i] + " ";
        yPosition -= 20;
      } else {
        line = testLine;
      }
    }
    page.drawText(line, { x: 70, y: yPosition, size: 12, font: fontTimesRoman });

    // 5. Signatures
    page.drawText("Verified By:", { x: 70, y: yPosition - 100, size: 12, font: fontTimesRoman });
    page.drawLine({ start: { x: 70, y: yPosition - 150 }, end: { x: 250, y: yPosition - 150 }, thickness: 1 });
    page.drawText("UNIVERSITY REGISTRAR", { x: 80, y: yPosition - 165, size: 10, font: fontTimesBold });

    // 6. Generate and Embed QR Code for Verification
    const verificationUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/receipt/${request.id}`;
    const qrCodeDataUrl = await QRCode.toDataURL(verificationUrl, { margin: 1, scale: 5 });
    const qrCodeImage = await pdfDoc.embedPng(qrCodeDataUrl);
    const qrDims = qrCodeImage.scale(0.5);

    page.drawImage(qrCodeImage, {
      x: width - 150,
      y: 50,
      width: qrDims.width,
      height: qrDims.height,
    });
    
    page.drawText("Scan to Verify Authenticity", {
      x: width - 155,
      y: 40,
      size: 8,
      font: fontHelvetica,
      color: rgb(0.5, 0.5, 0.5),
    });

    // 7. Serialize PDF
    const pdfBytes = await pdfDoc.save();

    // 8. Return the PDF as a downloadable stream
    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="NEU_${documentLabel.replace(/\s+/g, "_")}_${studentName.replace(/\s+/g, "_")}.pdf"`,
      },
    });

  } catch (error) {
    console.error("[PDF_GENERATION_ERROR]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
