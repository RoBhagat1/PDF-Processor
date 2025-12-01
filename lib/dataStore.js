/**
 * Data store for historical invoice data
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data');
const HISTORY_FILE = path.join(DATA_DIR, 'invoiceHistory.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

/**
 * Load invoice history from disk
 */
function loadHistory() {
  if (!fs.existsSync(HISTORY_FILE)) {
    return {
      invoices: [],
      itemAverages: {},
      vendorAverages: {},
      lastUpdated: null,
    };
  }

  try {
    const data = fs.readFileSync(HISTORY_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error loading history:', err);
    return {
      invoices: [],
      itemAverages: {},
      vendorAverages: {},
      lastUpdated: null,
    };
  }
}

/**
 * Save invoice history to disk
 */
function saveHistory(data) {
  data.lastUpdated = new Date().toISOString();
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(data, null, 2), 'utf8');
}

/**
 * Add a new invoice to history
 */
function addInvoice(invoiceData) {
  const history = loadHistory();

  const invoiceRecord = {
    id: generateId(),
    filename: invoiceData.filename,
    processedDate: new Date().toISOString(),
    metadata: invoiceData.metadata,
    lineItems: invoiceData.lineItems,
    totals: invoiceData.totals,
  };

  history.invoices.push(invoiceRecord);
  saveHistory(history);

  return invoiceRecord;
}

/**
 * Get all invoices from history
 */
function getAllInvoices() {
  return loadHistory().invoices;
}

/**
 * Get invoices by vendor
 */
function getInvoicesByVendor(vendor) {
  const history = loadHistory();
  return history.invoices.filter(inv => inv.metadata.vendor === vendor);
}

/**
 * Clear all history (use with caution!)
 */
function clearHistory() {
  const emptyHistory = {
    invoices: [],
    itemAverages: {},
    vendorAverages: {},
    lastUpdated: null,
  };
  saveHistory(emptyHistory);
}

/**
 * Generate unique ID for invoice
 */
function generateId() {
  return `inv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

module.exports = {
  loadHistory,
  saveHistory,
  addInvoice,
  getAllInvoices,
  getInvoicesByVendor,
  clearHistory,
};
