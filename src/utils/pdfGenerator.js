const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

/**
 * Generates a complete KYC PDF by filling the 55-page official form 
 * and adding a 56th summary page with ALL user details.
 */
async function generateKycPdf(applicationData) {
  try {
    const { 
      personalDetails, 
      identityDetails, 
      address, 
      bankDetails, 
      selfieDetails, 
      signature, 
      applicationId,
      nomineeDetails,
      pricingPlan,
      financialProof
    } = applicationData;
    
    // 1. Load the official PDF (55 pages)
    const officialPdfPath = path.join(__dirname, '../../../public/official_form.pdf');
    if (!fs.existsSync(officialPdfPath)) {
      throw new Error("Official form PDF not found at: " + officialPdfPath);
    }
    
    const officialPdfBytes = fs.readFileSync(officialPdfPath);
    const officialPdf = await PDFDocument.load(officialPdfBytes);
    
    // 2. Create a new document and copy all pages
    const pdfDoc = await PDFDocument.create();
    const copiedPages = await pdfDoc.copyPages(officialPdf, officialPdf.getPageIndices());
    copiedPages.forEach((page) => pdfDoc.addPage(page));
    
    // 3. Add the 56th Summary Annexure Page
    const page = pdfDoc.addPage([595.28, 841.89]); // A4
    const { width, height } = page.getSize();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    // Header
    page.drawText('KYC SUMMARY ANNEXURE (Page 56)', {
      x: 50, y: height - 50, size: 18, font: boldFont, color: rgb(0, 0, 0),
    });

    let currentY = height - 90;
    const lineHeight = 18;

    const drawSection = (title) => {
      currentY -= 10;
      page.drawRectangle({
        x: 45, y: currentY - 5, width: width - 90, height: 20,
        color: rgb(0.9, 0.9, 0.95),
      });
      page.drawText(title.toUpperCase(), {
        x: 50, y: currentY, size: 10, font: boldFont, color: rgb(0.1, 0.1, 0.4),
      });
      currentY -= 25;
    };

    const drawField = (label, value) => {
      const displayValue = String(value || 'Not Provided');
      page.drawText(`${label}:`, { x: 50, y: currentY, size: 9, font: boldFont });
      
      // Simple wrapping for long values
      if (displayValue.length > 60) {
        const part1 = displayValue.substring(0, 60);
        const part2 = displayValue.substring(60);
        page.drawText(part1, { x: 180, y: currentY, size: 9, font: font });
        currentY -= lineHeight - 4;
        page.drawText(part2, { x: 180, y: currentY, size: 9, font: font });
      } else {
        page.drawText(displayValue, { x: 180, y: currentY, size: 9, font: font });
      }
      currentY -= lineHeight;
    };

    // Application Info
    drawSection('Application Information');
    drawField('Application ID', applicationId);
    drawField('Status', applicationData.status);
    drawField('Submission Date', new Date().toLocaleDateString());
    drawField('Selected Plan', pricingPlan?.name || 'Standard');

    // Personal Details
    drawSection('Personal & Identity Details');
    drawField('Full Name', personalDetails?.fullName);
    drawField('Father / Spouse', personalDetails?.fatherName);
    drawField('Date of Birth', personalDetails?.dob);
    drawField('Gender', personalDetails?.gender);
    drawField('PAN Number', identityDetails?.pan);
    drawField('Aadhaar Number', identityDetails?.aadhaar);
    drawField('Marital Status', personalDetails?.maritalStatus);
    drawField('Occupation', personalDetails?.occupation);
    drawField('Annual Income', personalDetails?.incomeRange);

    // Address Details
    drawSection('Contact & Address Details');
    drawField('Email', applicationData.email || 'Not Provided');
    drawField('Phone', applicationData.phone || 'Not Provided');
    
    // Robust Address Wrapping
    const fullAddress = `${address?.line1 || ''}, ${address?.line2 || ''}, ${address?.city || ''}, ${address?.state || ''} - ${address?.pincode || ''}`;
    drawField('Permanent Address', fullAddress);

    // Bank Details
    drawSection('Bank Account Details');
    drawField('Bank Name', bankDetails?.bankName);
    drawField('Account Number', bankDetails?.accountNumber);
    drawField('IFSC Code', bankDetails?.ifsc);
    drawField('Account Type', bankDetails?.accountType || 'Savings');

    // Nominee Details
    const isNomineeOpted = nomineeDetails?.opted === "Yes" || nomineeDetails?.opted === true;
    if (isNomineeOpted && nomineeDetails?.nominees?.length > 0) {
      drawSection('Nominee Details');
      nomineeDetails.nominees.forEach((nom, idx) => {
        if (nom.name || nom.fullName) {
          drawField(`Nominee ${idx + 1}`, nom.fullName || nom.name);
          drawField(`Relationship`, nom.relationship || nom.relation);
          drawField(`Nominee DOB`, nom.dob);
        }
      });
    }

    // 4. Images Section
    currentY -= 20;

    // Embed Selfie
    const selfiePathRel = selfieDetails?.path || selfieDetails?.preview || applicationData?.selfie?.preview;
    if (selfiePathRel) {
      try {
        const cleanPath = selfiePathRel.startsWith('/') ? selfiePathRel.substring(1) : selfiePathRel;
        const selfiePath = path.join(__dirname, '../../', cleanPath);
        if (fs.existsSync(selfiePath)) {
          const imageBytes = fs.readFileSync(selfiePath);
          const image = (selfiePath.toLowerCase().endsWith('.png')) ? await pdfDoc.embedPng(imageBytes) : await pdfDoc.embedJpg(imageBytes);
          page.drawImage(image, { x: 50, y: currentY - 140, width: 120, height: 120 });
          page.drawText('CUSTOMER SELFIE', { x: 50, y: currentY - 155, size: 8, font: boldFont });
        }
      } catch (e) { console.error("[PDF Gen] Selfie fail:", e.message); }
    }

    // Embed Signature
    const sigPathRel = signature?.path || signature?.preview;
    if (sigPathRel) {
      try {
        const cleanPath = sigPathRel.startsWith('/') ? sigPathRel.substring(1) : sigPathRel;
        const sigPath = path.join(__dirname, '../../', cleanPath);
        if (fs.existsSync(sigPath)) {
          const imageBytes = fs.readFileSync(sigPath);
          const image = (sigPath.toLowerCase().endsWith('.png')) ? await pdfDoc.embedPng(imageBytes) : await pdfDoc.embedJpg(imageBytes);
          page.drawImage(image, { x: 350, y: currentY - 140, width: 120, height: 60 });
          page.drawText('CUSTOMER SIGNATURE', { x: 350, y: currentY - 155, size: 8, font: boldFont });
        }
      } catch (e) { console.error("[PDF Gen] Sig fail:", e.message); }
    }

    console.log(`[PDF Gen] Successfully generated detailed 56-page PDF`);
    return await pdfDoc.saveAsBase64();
  } catch (error) {
    console.error("[PDF Gen] Fatal error:", error);
    throw error;
  }
}

module.exports = { generateKycPdf };
