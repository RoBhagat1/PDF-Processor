/**
 * Statistical calculations for invoice data
 */

const { loadHistory, saveHistory } = require('./dataStore');

/**
 * Calculate mean and standard deviation from array of values
 */
function calculateStats(values) {
  if (!values || values.length === 0) {
    return { mean: 0, stdDev: 0, count: 0 };
  }

  const count = values.length;
  const mean = values.reduce((sum, val) => sum + val, 0) / count;

  const variance = values.reduce((sum, val) => {
    return sum + Math.pow(val - mean, 2);
  }, 0) / count;

  const stdDev = Math.sqrt(variance);

  return { mean, stdDev, count };
}

/**
 * Normalize item descriptions for matching
 * (handles variations in spacing, capitalization)
 */
function normalizeItemDescription(description) {
  return description
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s]/g, '');
}

/**
 * Calculate per-item averages from all historical invoices
 */
function calculateItemAverages() {
  const history = loadHistory();
  const itemData = {};

  // Aggregate data per item description
  history.invoices.forEach(invoice => {
    if (!invoice.lineItems) return;

    invoice.lineItems.forEach(item => {
      const key = normalizeItemDescription(item.description);

      if (!itemData[key]) {
        itemData[key] = {
          originalName: item.description, // Keep first seen name
          unitPrices: [],
          quantities: [],
          amounts: [],
        };
      }

      if (item.unitPrice != null) itemData[key].unitPrices.push(item.unitPrice);
      if (item.quantity != null) itemData[key].quantities.push(item.quantity);
      if (item.amount != null) itemData[key].amounts.push(item.amount);
    });
  });

  // Calculate statistics for each item
  const itemAverages = {};
  for (const [key, data] of Object.entries(itemData)) {
    const priceStats = calculateStats(data.unitPrices);
    const qtyStats = calculateStats(data.quantities);
    const amountStats = calculateStats(data.amounts);

    itemAverages[key] = {
      originalName: data.originalName,
      avgUnitPrice: priceStats.mean,
      unitPriceStdDev: priceStats.stdDev,
      avgQuantity: qtyStats.mean,
      quantityStdDev: qtyStats.stdDev,
      avgAmount: amountStats.mean,
      amountStdDev: amountStats.stdDev,
      count: priceStats.count,
    };
  }

  return itemAverages;
}

/**
 * Calculate vendor-level averages
 */
function calculateVendorAverages() {
  const history = loadHistory();
  const vendorData = {};

  history.invoices.forEach(invoice => {
    const vendor = invoice.metadata?.vendor || 'Unknown';

    if (!vendorData[vendor]) {
      vendorData[vendor] = {
        totals: [],
        subtotals: [],
        taxes: [],
      };
    }

    if (invoice.totals?.total != null) {
      vendorData[vendor].totals.push(invoice.totals.total);
    }
    if (invoice.totals?.subtotal != null) {
      vendorData[vendor].subtotals.push(invoice.totals.subtotal);
    }
    if (invoice.totals?.tax != null) {
      vendorData[vendor].taxes.push(invoice.totals.tax);
    }
  });

  // Calculate statistics for each vendor
  const vendorAverages = {};
  for (const [vendor, data] of Object.entries(vendorData)) {
    const totalStats = calculateStats(data.totals);
    const subtotalStats = calculateStats(data.subtotals);
    const taxStats = calculateStats(data.taxes);

    vendorAverages[vendor] = {
      avgTotal: totalStats.mean,
      totalStdDev: totalStats.stdDev,
      avgSubtotal: subtotalStats.mean,
      subtotalStdDev: subtotalStats.stdDev,
      avgTax: taxStats.mean,
      taxStdDev: taxStats.stdDev,
      count: totalStats.count,
    };
  }

  return vendorAverages;
}

/**
 * Update all statistics and save to history
 */
function updateStatistics() {
  const history = loadHistory();

  history.itemAverages = calculateItemAverages();
  history.vendorAverages = calculateVendorAverages();

  saveHistory(history);

  return {
    itemAverages: history.itemAverages,
    vendorAverages: history.vendorAverages,
  };
}

module.exports = {
  calculateStats,
  calculateItemAverages,
  calculateVendorAverages,
  updateStatistics,
  normalizeItemDescription,
};
