/**
 * Enhanced invoice parser with field extraction
 */

const PATTERNS = {
  // Invoice identifiers
  invoiceNumber: /invoice\s*(?:#|number|no\.?)?\s*:?\s*([A-Z0-9-]+)/i,
  invoiceDate: /(?:invoice\s*)?date\s*:?\s*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i,
  vendor: /(?:from|vendor|company)\s*:?\s*([A-Z][A-Za-z\s&.,]+?)(?:\n|$)/i,

  // Financial patterns
  currency: /\$|USD|EUR|GBP/,
  amount: /\$?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/,

  // Line item patterns (flexible to match various formats)
  // Matches: "Description  Qty  Price  Total"
  lineItem: /^(.+?)\s{2,}(\d+)\s+\$?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)\s+\$?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)$/m,

  // Alternative line item with commas
  lineItemComma: /^([^,]+),\s*(\d+),\s*\$?\s*(\d+(?:,\d{3})*(?:\.\d{2})?),\s*\$?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)$/m,

  // Total patterns
  subtotal: /sub\s*total\s*:?\s*\$?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/i,
  tax: /tax\s*(?:\([\d.]+%\))?\s*:?\s*\$?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/i,
  total: /(?:grand\s*)?total\s*(?:amount)?\s*:?\s*\$?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/i,
};

/**
 * Extract invoice metadata (number, date, vendor)
 */
function extractInvoiceMetadata(text) {
  const metadata = {
    invoiceNumber: null,
    invoiceDate: null,
    vendor: null,
  };

  const invoiceMatch = text.match(PATTERNS.invoiceNumber);
  if (invoiceMatch) metadata.invoiceNumber = invoiceMatch[1];

  const dateMatch = text.match(PATTERNS.invoiceDate);
  if (dateMatch) metadata.invoiceDate = dateMatch[1];

  const vendorMatch = text.match(PATTERNS.vendor);
  if (vendorMatch) metadata.vendor = vendorMatch[1].trim();

  return metadata;
}

/**
 * Extract line items from invoice text
 */
function extractLineItems(text) {
  const lines = text.split('\n');
  const lineItems = [];

  for (const line of lines) {
    // Try whitespace-separated format first
    let match = line.match(PATTERNS.lineItem);

    // If no match, try comma-separated format
    if (!match) {
      match = line.match(PATTERNS.lineItemComma);
    }

    if (match) {
      const description = match[1].trim();
      const quantity = parseInt(match[2]);
      const unitPrice = parseFloat(match[3].replace(/,/g, ''));
      const amount = parseFloat(match[4].replace(/,/g, ''));

      // Basic validation
      if (!isNaN(quantity) && !isNaN(unitPrice) && !isNaN(amount)) {
        lineItems.push({
          description,
          quantity,
          unitPrice,
          amount,
        });
      }
    }
  }

  return lineItems;
}

/**
 * Extract financial totals from invoice
 */
function extractTotals(text) {
  const totals = {
    subtotal: null,
    tax: null,
    total: null,
  };

  const subtotalMatch = text.match(PATTERNS.subtotal);
  if (subtotalMatch) {
    totals.subtotal = parseFloat(subtotalMatch[1].replace(/,/g, ''));
  }

  const taxMatch = text.match(PATTERNS.tax);
  if (taxMatch) {
    totals.tax = parseFloat(taxMatch[1].replace(/,/g, ''));
  }

  const totalMatch = text.match(PATTERNS.total);
  if (totalMatch) {
    totals.total = parseFloat(totalMatch[1].replace(/,/g, ''));
  }

  return totals;
}

/**
 * Parse complete invoice structure from text
 */
function parseInvoice(text) {
  return {
    metadata: extractInvoiceMetadata(text),
    lineItems: extractLineItems(text),
    totals: extractTotals(text),
    rawText: text,
  };
}

module.exports = {
  parseInvoice,
  extractInvoiceMetadata,
  extractLineItems,
  extractTotals,
  PATTERNS,
};
