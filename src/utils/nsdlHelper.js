function buildNSDLPayload(data) {
  const pd = data.personalDetails || {};
  const addr = data.address || {};
  const bank = data.bankDetails || {};

  return {
    instr: {
      beneficiaryDetails: {
        primaryBeneficiary: {
          name: pd.fullName || "",
          shortName: (pd.fullName || "").split(" ")[0],
          pan: data.identityDetails?.pan || "",
          panFlag: data.identityDetails?.pan ? "Y" : "N",
          grossAnnualIncome: "01",
          dob: pd.dob ? pd.dob.replace(/-/g, "") : "",
          gender: pd.gender || "1",
          aadhar: data.identityDetails?.aadhaar || "",
          mobile: data.phone || "",
          email: pd.email || "",
          ddpiid: "",
          eStatement: "E",
          dematAccType: "01",
          dematAccSubType: "01",
          modeOfOperation: "",
          periodicStatement: "REG",
          beneficiaryCoresAddress: {
            addressType: "1",
            addressLine1: addr.line1 || "",
            addressLine2: addr.line2 || "",
            addressLine3: addr.line3 || "",
            addressLine4: "",
            zipcode: addr.pincode || "",
            city: addr.city || "",
            statecode: addr.state || "",
            countrycode: "356",
          },
          signature: "",
        },
        numOfJointHolders: "0",
        listOfJointHolders: [],
        additionalBeneDetails: {
          familyMobileFlag: "N",
          familyEmailFlag: "N",
          nominationOption: "N",
          occupation: pd.occupation || "8",
          fatherOrHusbandName: pd.fatherName || "",
          dpId: "",
          clientId: "",
          sharePercentEqually: "N",
          numOfNominees: "0",
          listOfNominees: [],
        },
      },
      bankDetails: {
        accountNumber: bank.accountNumber || "",
        bankName: bank.bankName || "",
        ifsc: bank.ifsc || "",
        micr: bank.micr || "",
        accountType: bank.accountType || "10",
        bankAddress: {
          addressType: "2",
          addressLine1: "", addressLine2: "", addressLine3: "", addressLine4: "",
          zipcode: "",
        },
      },
    },
  };
}

module.exports = { buildNSDLPayload };
