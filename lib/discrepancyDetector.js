/**
 * Discrepancy detection with configurable thresholds
 */

const { loadHistory } = require('./dataStore');
const { normalizeItemDescription } = require('./statisticsCalculator');

// Default configuration
const DEFAULT_CONFIG = {
  // Percentage variance threshold (e.g., 0.15 = 15%)
  percentageThreshold: 0.15,

  // Standard deviation threshold (e.g., 2 = 2 standard deviations)
  stdDevThreshold: 2,

  // Detection mode: 'percentage', 'stddev', or 'both'
  mode: 'both',

  // Minimum historical samples required for comparison
  minSamples: 3,

  // Check line items, totals, or both
  checkLineItems: true,
  checkTotals: true,
};

/**
 * Detect discrepancies in an invoice
 */
function detectDiscrepancies(invoiceData, config = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const history = loadHistory();
  const discrepancies = [];

  // Check line items
  if (cfg.checkLineItems && invoiceData.lineItems) {
    invoiceData.lineItems.forEach((item, index) => {
      const itemKey = normalizeItemDescription(item.description);
      const historical = history.itemAverages?.[itemKey];

      if (!historical || historical.count < cfg.minSamples) {
        // Not enough historical data - skip comparison
        return;
      }

      // Check unit price
      if (item.unitPrice != null && historical.avgUnitPrice > 0) {
        const priceDiscrepancy = checkValue(
          item.unitPrice,
          historical.avgUnitPrice,
          historical.unitPriceStdDev,
          cfg
        );

        if (priceDiscrepancy.isDiscrepancy) {
          discrepancies.push({
            type: 'line_item',
            lineIndex: index,
            field: 'unitPrice',
            description: item.description,
            currentValue: item.unitPrice,
            historicalAverage: historical.avgUnitPrice,
            percentageVariance: priceDiscrepancy.percentageVariance,
            stdDevVariance: priceDiscrepancy.stdDevVariance,
            severity: priceDiscrepancy.severity,
            historicalCount: historical.count,
          });
        }
      }

      // Check quantity
      if (item.quantity != null && historical.avgQuantity > 0) {
        const qtyDiscrepancy = checkValue(
          item.quantity,
          historical.avgQuantity,
          historical.quantityStdDev,
          cfg
        );

        if (qtyDiscrepancy.isDiscrepancy) {
          discrepancies.push({
            type: 'line_item',
            lineIndex: index,
            field: 'quantity',
            description: item.description,
            currentValue: item.quantity,
            historicalAverage: historical.avgQuantity,
            percentageVariance: qtyDiscrepancy.percentageVariance,
            stdDevVariance: qtyDiscrepancy.stdDevVariance,
            severity: qtyDiscrepancy.severity,
            historicalCount: historical.count,
          });
        }
      }

      // Check amount
      if (item.amount != null && historical.avgAmount > 0) {
        const amountDiscrepancy = checkValue(
          item.amount,
          historical.avgAmount,
          historical.amountStdDev,
          cfg
        );

        if (amountDiscrepancy.isDiscrepancy) {
          discrepancies.push({
            type: 'line_item',
            lineIndex: index,
            field: 'amount',
            description: item.description,
            currentValue: item.amount,
            historicalAverage: historical.avgAmount,
            percentageVariance: amountDiscrepancy.percentageVariance,
            stdDevVariance: amountDiscrepancy.stdDevVariance,
            severity: amountDiscrepancy.severity,
            historicalCount: historical.count,
          });
        }
      }
    });
  }

  // Check totals (if vendor known)
  if (cfg.checkTotals && invoiceData.metadata?.vendor) {
    const vendor = invoiceData.metadata.vendor;
    const vendorHistorical = history.vendorAverages?.[vendor];

    if (vendorHistorical && vendorHistorical.count >= cfg.minSamples) {
      // Check total
      if (invoiceData.totals?.total != null && vendorHistorical.avgTotal > 0) {
        const totalDiscrepancy = checkValue(
          invoiceData.totals.total,
          vendorHistorical.avgTotal,
          vendorHistorical.totalStdDev,
          cfg
        );

        if (totalDiscrepancy.isDiscrepancy) {
          discrepancies.push({
            type: 'total',
            field: 'total',
            vendor: vendor,
            currentValue: invoiceData.totals.total,
            historicalAverage: vendorHistorical.avgTotal,
            percentageVariance: totalDiscrepancy.percentageVariance,
            stdDevVariance: totalDiscrepancy.stdDevVariance,
            severity: totalDiscrepancy.severity,
            historicalCount: vendorHistorical.count,
          });
        }
      }

      // Check subtotal
      if (invoiceData.totals?.subtotal != null && vendorHistorical.avgSubtotal > 0) {
        const subtotalDiscrepancy = checkValue(
          invoiceData.totals.subtotal,
          vendorHistorical.avgSubtotal,
          vendorHistorical.subtotalStdDev,
          cfg
        );

        if (subtotalDiscrepancy.isDiscrepancy) {
          discrepancies.push({
            type: 'total',
            field: 'subtotal',
            vendor: vendor,
            currentValue: invoiceData.totals.subtotal,
            historicalAverage: vendorHistorical.avgSubtotal,
            percentageVariance: subtotalDiscrepancy.percentageVariance,
            stdDevVariance: subtotalDiscrepancy.stdDevVariance,
            severity: subtotalDiscrepancy.severity,
            historicalCount: vendorHistorical.count,
          });
        }
      }
    }
  }

  return {
    hasDiscrepancies: discrepancies.length > 0,
    discrepancyCount: discrepancies.length,
    discrepancies,
    config: cfg,
  };
}

/**
 * Check if a value is a discrepancy based on historical data
 */
function checkValue(currentValue, historicalMean, historicalStdDev, config) {
  if (currentValue == null || historicalMean == null || historicalMean === 0) {
    return { isDiscrepancy: false };
  }

  // Calculate percentage variance
  const percentageVariance = Math.abs((currentValue - historicalMean) / historicalMean);

  // Calculate standard deviation variance (handle zero stdDev)
  const stdDevVariance = historicalStdDev > 0
    ? Math.abs((currentValue - historicalMean) / historicalStdDev)
    : 0;

  let isDiscrepancy = false;

  if (config.mode === 'percentage') {
    isDiscrepancy = percentageVariance > config.percentageThreshold;
  } else if (config.mode === 'stddev') {
    isDiscrepancy = stdDevVariance > config.stdDevThreshold;
  } else if (config.mode === 'both') {
    // Flag if EITHER threshold is exceeded
    isDiscrepancy = percentageVariance > config.percentageThreshold ||
                    (historicalStdDev > 0 && stdDevVariance > config.stdDevThreshold);
  }

  // Determine severity
  let severity = 'low';
  if (percentageVariance > config.percentageThreshold * 2 ||
      stdDevVariance > config.stdDevThreshold * 1.5) {
    severity = 'high';
  } else if (percentageVariance > config.percentageThreshold * 1.5 ||
             stdDevVariance > config.stdDevThreshold * 1.2) {
    severity = 'medium';
  }

  return {
    isDiscrepancy,
    percentageVariance,
    stdDevVariance,
    severity,
  };
}

module.exports = {
  detectDiscrepancies,
  checkValue,
  DEFAULT_CONFIG,
};
