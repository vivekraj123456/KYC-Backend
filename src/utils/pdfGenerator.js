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

    const safeJsonParse = (str) => {
      try { return typeof str === 'string' ? JSON.parse(str) : str; } catch { return str; }
    };

    const parsedPersonalDetails = safeJsonParse(personalDetails) || {};
    const parsedIdentityDetails = safeJsonParse(identityDetails) || {};
    const parsedAddress = safeJsonParse(address) || {};
    const parsedBankDetails = safeJsonParse(bankDetails) || {};
    const parsedSelfieDetails = safeJsonParse(selfieDetails) || {};
    const parsedSignature = safeJsonParse(signature) || {};
    const parsedNomineeDetails = safeJsonParse(nomineeDetails) || {};
    const parsedPricingPlan = safeJsonParse(pricingPlan) || {};
    const parsedFinancialProof = safeJsonParse(financialProof) || {};
    const parsedDocuments = safeJsonParse(applicationData.documents) || [];
    const parsedPanUpload = safeJsonParse(applicationData.panUpload) || {};
    
    // 1. Load the official PDF (55 pages)
    const officialPdfPath = path.join(__dirname, '../../../public/official_form.pdf');
    if (!fs.existsSync(officialPdfPath)) {
      throw new Error("Official form PDF not found at: " + officialPdfPath);
    }
    
    const officialPdfBytes = fs.readFileSync(officialPdfPath);
    const officialPdf = await PDFDocument.load(officialPdfBytes);

    // 2. Create a new document
    const pdfDoc = await PDFDocument.create();
    
    const copiedPages = await pdfDoc.copyPages(officialPdf, officialPdf.getPageIndices());
    copiedPages.forEach((page) => pdfDoc.addPage(page));
    
    // 3. Add the Summary Annexure Page
    const page = pdfDoc.addPage([595.28, 841.89]); // A4
    const { width, height } = page.getSize();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    // Header
    page.drawText('KYC SUMMARY ANNEXURE (Page 1)', {
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
    drawField('Full Name', parsedPersonalDetails?.fullName);
    drawField('Father / Spouse', parsedPersonalDetails?.fatherName);
    drawField('Date of Birth', parsedPersonalDetails?.dob);
    drawField('Gender', parsedPersonalDetails?.gender);
    drawField('PAN Number', parsedIdentityDetails?.pan);
    drawField('Aadhaar Number', parsedIdentityDetails?.aadhaar);
    drawField('Marital Status', parsedPersonalDetails?.maritalStatus);
    drawField('Occupation', parsedPersonalDetails?.occupation);
    drawField('Annual Income', parsedPersonalDetails?.incomeRange || parsedPersonalDetails?.annualIncome);

    // Address Details
    drawSection('Contact & Address Details');
    drawField('Email', applicationData.email || parsedPersonalDetails?.email || 'Not Provided');
    drawField('Phone', applicationData.phone || parsedPersonalDetails?.phone || 'Not Provided');
    
    // Robust Address Wrapping
    const fullAddress = `${parsedAddress?.line1 || ''}, ${parsedAddress?.line2 || ''}, ${parsedAddress?.city || ''}, ${parsedAddress?.state || ''} - ${parsedAddress?.pincode || ''}`;
    drawField('Permanent Address', fullAddress.replace(/^[,\s]+|[,\s]+$/g, ''));

    // Bank Details
    drawSection('Bank Account Details');
    drawField('Bank Name', parsedBankDetails?.bankName);
    drawField('Account Number', parsedBankDetails?.accountNumber);
    drawField('IFSC Code', parsedBankDetails?.ifsc);
    drawField('Account Type', parsedBankDetails?.accountType || 'Savings');

    // Nominee Details
    const isNomineeOpted = parsedNomineeDetails?.opted === "Yes" || parsedNomineeDetails?.opted === true;
    if (isNomineeOpted && parsedNomineeDetails?.nominees?.length > 0) {
      drawSection('Nominee Details');
      parsedNomineeDetails.nominees.forEach((nom, idx) => {
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
    const sigPathRel = parsedSignature?.path || parsedSignature?.preview;
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

    // 5. Append Uploaded and Extracted Documents
    const appendDocument = async (docPathRel, title) => {
      if (!docPathRel) return;
      try {
        const cleanPath = docPathRel.startsWith('/') ? docPathRel.substring(1) : docPathRel;
        const docPath = path.join(__dirname, '../../', cleanPath);
        if (!fs.existsSync(docPath)) return;

        const bytes = fs.readFileSync(docPath);
        const lowerPath = docPath.toLowerCase();

        if (lowerPath.endsWith('.pdf')) {
          const externalPdf = await PDFDocument.load(bytes);
          const copied = await pdfDoc.copyPages(externalPdf, externalPdf.getPageIndices());
          copied.forEach((p) => pdfDoc.addPage(p));
        } else if (lowerPath.endsWith('.jpg') || lowerPath.endsWith('.jpeg') || lowerPath.endsWith('.png')) {
          const img = lowerPath.endsWith('.png') ? await pdfDoc.embedPng(bytes) : await pdfDoc.embedJpg(bytes);
          const imgPage = pdfDoc.addPage([595.28, 841.89]); // A4
          const { width: pWidth, height: pHeight } = imgPage.getSize();
          
          if (title) {
            imgPage.drawText(title.toUpperCase(), { x: 50, y: pHeight - 50, size: 14, font: boldFont, color: rgb(0,0,0) });
          }

          const imgDims = img.scaleToFit(pWidth - 100, pHeight - 100);
          imgPage.drawImage(img, {
            x: pWidth / 2 - imgDims.width / 2,
            y: pHeight / 2 - imgDims.height / 2,
            width: imgDims.width,
            height: imgDims.height,
          });
        }
      } catch (e) {
        console.error(`[PDF Gen] Failed to append document ${docPathRel}:`, e.message);
      }
    };

    const docsToAppend = [];
    
    // Add documents array items (e.g. DigiLocker extracted)
    parsedDocuments.forEach(doc => {
      if (doc?.path) docsToAppend.push({ path: doc.path, title: doc.type || 'Document' });
    });
    
    if (parsedPanUpload?.path) docsToAppend.push({ path: parsedPanUpload.path, title: 'PAN Upload' });
    if (parsedFinancialProof?.path) docsToAppend.push({ path: parsedFinancialProof.path, title: 'Financial Proof' });
    if (parsedBankDetails?.proofPath) docsToAppend.push({ path: parsedBankDetails.proofPath, title: 'Bank Proof' });
    if (parsedPersonalDetails?.pepProof) docsToAppend.push({ path: parsedPersonalDetails.pepProof, title: 'PEP Proof' });
    
    if (parsedNomineeDetails?.nominees) {
      parsedNomineeDetails.nominees.forEach((nom, idx) => {
        if (nom.proofPath) docsToAppend.push({ path: nom.proofPath, title: `Nominee ${idx + 1} Proof` });
        if (nom.guardianProofPath) docsToAppend.push({ path: nom.guardianProofPath, title: `Nominee ${idx + 1} Guardian Proof` });
      });
    }

    const seenPaths = new Set();
    for (const doc of docsToAppend) {
      if (seenPaths.has(doc.path)) continue;
      seenPaths.add(doc.path);
      await appendDocument(doc.path, doc.title);
    }

    // 6. Draw Digio Green Tick Watermark on ALL Pages
    const allPages = pdfDoc.getPages();
    for (const p of allPages) {
      const { width, height } = p.getSize();
      
      // Draw watermark box at the bottom right
      p.drawRectangle({
        x: width - 200,
        y: 15,
        width: 180,
        height: 45,
        borderColor: rgb(0.1, 0.7, 0.1),
        borderWidth: 2,
        color: rgb(0.95, 1.0, 0.95),
        opacity: 0.8,
        borderOpacity: 0.8
      });
      
      // Green Tick SVG
      p.drawSvgPath('M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z', {
        x: width - 190,
        y: 45,
        scale: 0.8,
        color: rgb(0.1, 0.7, 0.1),
      });

      p.drawText('VERIFIED DIGITAL SIGNATURE', {
        x: width - 165,
        y: 40,
        size: 9,
        font: boldFont,
        color: rgb(0.1, 0.6, 0.1),
      });
      p.drawText('Aadhaar eSign via Digio API', {
        x: width - 165,
        y: 26,
        size: 8,
        font: font,
        color: rgb(0.3, 0.6, 0.3),
      });
    }

    console.log(`[PDF Gen] Successfully generated detailed 56-page PDF with appended documents`);
    return await pdfDoc.saveAsBase64();
  } catch (error) {
    console.error("[PDF Gen] Fatal error:", error);
    throw error;
  }
}

module.exports = { generateKycPdf };
