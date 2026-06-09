const DEFAULT_STEPS = [
  { id: "welcome", label: "Welcome", isOptional: false },
  { id: "phone", label: "Phone", isOptional: false },
  { id: "email", label: "Email", isOptional: false },
  { id: "pricing", label: "Pricing", isOptional: false },
  { id: "pan", label: "PAN", isOptional: false },
  { id: "digilocker", label: "DigiLocker", isOptional: false },
  { id: "details", label: "Details", isOptional: false },
  { id: "nomineeChoice", label: "Nominee Choice", isOptional: false },
  { id: "nominee", label: "Nominee", isOptional: true },
  { id: "nomineeAllocation", label: "Allocation", isOptional: true },
  { id: "bankVerification", label: "Bank Verification", isOptional: false },
  { id: "documentUpload", label: "Document Upload", isOptional: false },
  { id: "esignPreview", label: "eSign Preview", isOptional: false },
  { id: "aadhaarEsign", label: "Aadhaar eSign", isOptional: false },
  { id: "finalCompletion", label: "Completion", isOptional: false },
];

module.exports = { DEFAULT_STEPS };
