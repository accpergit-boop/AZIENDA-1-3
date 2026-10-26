const UNIFIED_PRICE_COMPANIES = new Set(["iqfoam-manufactoring", "iqfoam-whole-sallers"]);

export const usesUnifiedPriceList = (companyId) => UNIFIED_PRICE_COMPANIES.has(companyId);

export const companyBrandName = (companyId) => ({
  "iqfoam-whole-sallers": "IQ FOAM WHOLESALERS",
  "iqfoam-manufactoring": "IQ FOAM MANUFACTURING",
}[companyId] || "SUPER IQ-FOAM");

export const companyProfileName = (companyId) => ({
  "iqfoam-whole-sallers": "IQFOAM WHOLESALERS",
  "iqfoam-manufactoring": "IQFOAM MANUFACTURING",
}[companyId] || "SUPERIQFOAM");

export const companyDisplayName = (name) => {
  if (!name) return "SUPERIQFOAM";
  if (/wholesale/i.test(name)) return "IQ FOAM WHOLESALERS";
  if (/manufactur|manufactor/i.test(name)) return "IQ FOAM MANUFACTURING";
  if (/super/i.test(name) && /iq\s*[- ]?foam/i.test(name)) return "SUPERIQFOAM";
  if (/iq\s*[- ]?foam/i.test(name)) return "IQFOAM";
  return name;
};