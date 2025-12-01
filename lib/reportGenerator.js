/**
 * Generate discrepancy reports in various formats
 */

/**
 * Generate complete report structure
 */
function generateReport(invoiceData, discrepancyResult) {
  const report = {
    invoice: {
      filename: invoiceData.filename,
      invoiceNumber: invoiceData.metadata?.invoiceNumber,
      invoiceDate: invoiceData.metadata?.invoiceDate,
      vendor: invoiceData.metadata?.vendor,
      total: invoiceData.totals?.total,
      subtotal: invoiceData.totals?.subtotal,
      tax: invoiceData.totals?.tax,
    },
    summary: generateSummary(discrepancyResult),
    discrepancies: discrepancyResult.discrepancies,
    lineItems: invoiceData.lineItems,
    timestamp: new Date().toISOString(),
  };

  return report;
}

/**
 * Generate summary statistics
 */
function generateSummary(discrepancyResult) {
  const summary = {
    hasDiscrepancies: discrepancyResult.hasDiscrepancies,
    totalCount: discrepancyResult.discrepancyCount,
    severityBreakdown: {
      high: 0,
      medium: 0,
      low: 0,
    },
    typeBreakdown: {
      line_item: 0,
      total: 0,
    },
  };

  discrepancyResult.discrepancies.forEach(d => {
    summary.severityBreakdown[d.severity]++;
    summary.typeBreakdown[d.type]++;
  });

  return summary;
}

/**
 * Generate plain text report
 */
function generateTextReport(report) {
  let text = `INVOICE DISCREPANCY REPORT\n`;
  text += `${'='.repeat(60)}\n\n`;
  text += `Invoice: ${report.invoice.invoiceNumber || 'Unknown'}\n`;
  text += `Date: ${report.invoice.invoiceDate || 'Unknown'}\n`;
  text += `Vendor: ${report.invoice.vendor || 'Unknown'}\n`;
  text += `Total: $${report.invoice.total?.toFixed(2) || '0.00'}\n\n`;

  text += `SUMMARY\n`;
  text += `-`.repeat(60) + '\n';
  text += `Status: ${report.summary.hasDiscrepancies ? '⚠ DISCREPANCIES FOUND' : '✓ NO DISCREPANCIES'}\n`;
  text += `Total Discrepancies: ${report.summary.totalCount}\n`;
  text += `Severity: High (${report.summary.severityBreakdown.high}) | `;
  text += `Medium (${report.summary.severityBreakdown.medium}) | `;
  text += `Low (${report.summary.severityBreakdown.low})\n\n`;

  if (report.discrepancies.length > 0) {
    text += `DISCREPANCIES\n`;
    text += `-`.repeat(60) + '\n';

    report.discrepancies.forEach((d, i) => {
      text += `\n${i + 1}. ${d.type.toUpperCase()} - ${d.field}\n`;
      if (d.description) text += `   Item: ${d.description}\n`;
      text += `   Current Value: ${d.currentValue}\n`;
      text += `   Historical Average: ${d.historicalAverage.toFixed(2)}\n`;
      text += `   Variance: ${(d.percentageVariance * 100).toFixed(1)}%\n`;
      text += `   Severity: ${d.severity.toUpperCase()}\n`;
      text += `   Based on ${d.historicalCount} historical samples\n`;
    });
  }

  text += `\n${'='.repeat(60)}\n`;
  text += `Generated: ${report.timestamp}\n`;

  return text;
}

/**
 * Generate HTML report
 */
function generateHTMLReport(report) {
  const statusClass = report.summary.hasDiscrepancies ? 'has-discrepancy' : 'no-discrepancy';
  const statusText = report.summary.hasDiscrepancies ? '⚠ DISCREPANCIES FOUND' : '✓ NO DISCREPANCIES';

  return `
<!DOCTYPE html>
<html>
<head>
  <title>Invoice Discrepancy Report</title>
  <meta charset="utf-8">
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
      margin: 0;
      padding: 20px;
      background: #f5f5f5;
    }
    .container { max-width: 1000px; margin: 0 auto; }
    .header {
      background: white;
      padding: 30px;
      border-radius: 8px;
      margin-bottom: 20px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    h1 { margin: 0 0 20px 0; color: #333; }
    .invoice-info { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; }
    .info-item { margin: 0; }
    .info-label { font-weight: 600; color: #666; }
    .info-value { color: #333; }

    .summary {
      margin: 20px 0;
      padding: 20px;
      border-radius: 8px;
      background: white;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .summary.has-discrepancy {
      border-left: 4px solid #dc3545;
      background: #fff5f5;
    }
    .summary.no-discrepancy {
      border-left: 4px solid #28a745;
      background: #f0fff4;
    }
    .summary h2 { margin-top: 0; }
    .status {
      font-size: 1.2em;
      font-weight: bold;
      margin: 10px 0;
    }
    .status.has-discrepancy { color: #dc3545; }
    .status.no-discrepancy { color: #28a745; }

    .severity-badges { margin: 15px 0; }
    .badge {
      display: inline-block;
      padding: 5px 12px;
      border-radius: 4px;
      margin-right: 10px;
      font-weight: 600;
      font-size: 0.9em;
    }
    .badge.high { background: #dc3545; color: white; }
    .badge.medium { background: #fd7e14; color: white; }
    .badge.low { background: #ffc107; color: #333; }

    .discrepancy {
      margin: 15px 0;
      padding: 20px;
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .discrepancy.high { border-left: 4px solid #dc3545; }
    .discrepancy.medium { border-left: 4px solid #fd7e14; }
    .discrepancy.low { border-left: 4px solid #ffc107; }

    .discrepancy h3 {
      margin: 0 0 15px 0;
      color: #333;
      font-size: 1.1em;
    }
    .discrepancy-details {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 15px;
    }
    .detail-item {
      padding: 10px;
      background: #f8f9fa;
      border-radius: 4px;
    }
    .detail-label {
      font-size: 0.85em;
      color: #666;
      margin-bottom: 5px;
    }
    .detail-value {
      font-weight: 600;
      color: #333;
    }
    .variance { color: #dc3545; }

    .footer {
      margin-top: 30px;
      padding: 15px;
      text-align: center;
      color: #666;
      font-size: 0.9em;
    }

    @media print {
      body { background: white; }
      .summary, .discrepancy, .header { box-shadow: none; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Invoice Discrepancy Report</h1>
      <div class="invoice-info">
        <div class="info-item">
          <div class="info-label">Invoice Number</div>
          <div class="info-value">${report.invoice.invoiceNumber || 'Unknown'}</div>
        </div>
        <div class="info-item">
          <div class="info-label">Date</div>
          <div class="info-value">${report.invoice.invoiceDate || 'Unknown'}</div>
        </div>
        <div class="info-item">
          <div class="info-label">Vendor</div>
          <div class="info-value">${report.invoice.vendor || 'Unknown'}</div>
        </div>
        <div class="info-item">
          <div class="info-label">Total Amount</div>
          <div class="info-value">$${report.invoice.total?.toFixed(2) || '0.00'}</div>
        </div>
      </div>
    </div>

    <div class="summary ${statusClass}">
      <h2>Summary</h2>
      <div class="status ${statusClass}">${statusText}</div>
      <p><strong>Total Discrepancies:</strong> ${report.summary.totalCount}</p>

      ${report.summary.totalCount > 0 ? `
      <div class="severity-badges">
        <span class="badge high">High: ${report.summary.severityBreakdown.high}</span>
        <span class="badge medium">Medium: ${report.summary.severityBreakdown.medium}</span>
        <span class="badge low">Low: ${report.summary.severityBreakdown.low}</span>
      </div>
      ` : ''}
    </div>

    ${report.discrepancies.length > 0 ? `
    <h2 style="margin: 30px 0 15px 0;">Discrepancy Details</h2>
    ${report.discrepancies.map((d, i) => `
      <div class="discrepancy ${d.severity}">
        <h3>#${i + 1}: ${d.type === 'line_item' ? d.description : d.field.toUpperCase()}</h3>
        <div class="discrepancy-details">
          <div class="detail-item">
            <div class="detail-label">Field</div>
            <div class="detail-value">${d.field}</div>
          </div>
          <div class="detail-item">
            <div class="detail-label">Current Value</div>
            <div class="detail-value">${d.currentValue}</div>
          </div>
          <div class="detail-item">
            <div class="detail-label">Historical Average</div>
            <div class="detail-value">${d.historicalAverage.toFixed(2)}</div>
          </div>
          <div class="detail-item">
            <div class="detail-label">Variance</div>
            <div class="detail-value variance">${(d.percentageVariance * 100).toFixed(1)}%</div>
          </div>
          <div class="detail-item">
            <div class="detail-label">Severity</div>
            <div class="detail-value">
              <span class="badge ${d.severity}">${d.severity.toUpperCase()}</span>
            </div>
          </div>
          <div class="detail-item">
            <div class="detail-label">Historical Samples</div>
            <div class="detail-value">${d.historicalCount}</div>
          </div>
        </div>
      </div>
    `).join('')}
    ` : ''}

    <div class="footer">
      Generated: ${new Date(report.timestamp).toLocaleString()}<br>
      Filename: ${report.invoice.filename || 'Unknown'}
    </div>
  </div>
</body>
</html>
  `.trim();
}

module.exports = {
  generateReport,
  generateSummary,
  generateTextReport,
  generateHTMLReport,
};
