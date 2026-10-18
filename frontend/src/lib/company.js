const UNIFIED_PRICE_COMPANIES = new Set(["iqfoam-manufactoring", "iqfoam-whole-sallers"]);

export const usesUnifiedPriceList = (companyId) => UNIFIED_PRICE_COMPANIES.has(companyId);