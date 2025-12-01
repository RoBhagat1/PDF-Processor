const express = require('express');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure PDFs directory exists
const uploadDir = path.join(__dirname, 'PDFs');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer storage config: store original filename in PDFs/
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Prevent path traversal and keep original name
    const name = path.basename(file.originalname);
    cb(null, Date.now() + '_' + name);
  }
});

const upload = multer({
  storage,
  fileFilter: function (req, file, cb) {
    // Accept when mimetype indicates PDF, or filename ends with .pdf
    const mimetypeOk = file.mimetype && file.mimetype === 'application/pdf';
    const nameOk = file.originalname && file.originalname.toLowerCase().endsWith('.pdf');
    if (!mimetypeOk && !nameOk) {
      return cb(new Error('Only PDF files are allowed'));
    }
    cb(null, true);
  },
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

app.use(express.static(path.join(__dirname, 'public')));

app.post('/upload', upload.single('pdf'), (req, res) => {
  if (!req.file) return res.status(400).send('No file uploaded');
  res.send({ message: 'Upload successful', file: req.file.filename });
});

// PDF processing: extract text and produce a simple table
const pdf = require('pdf-parse');
const unzipper = require('unzipper');

// Invoice discrepancy detection modules
const { parseInvoice } = require('./lib/invoiceParser');
const { addInvoice, loadHistory } = require('./lib/dataStore');
const { updateStatistics } = require('./lib/statisticsCalculator');
const { detectDiscrepancies } = require('./lib/discrepancyDetector');
const { generateReport, generateTextReport, generateHTMLReport } = require('./lib/reportGenerator');

// Helper: convert extracted text into a naive table by splitting lines and columns
function textToTable(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  // Heuristic: if a line contains multiple two-or-more spaces, treat as column separator
  const table = lines.map(line => {
    if (/ {2,}/.test(line)) {
      return line.split(/ {2,}/).map(c => c.trim());
    }
    // If commas look like separators, split on comma
    if (/,/.test(line)) return line.split(/,\s*/).map(c => c.trim());
    // Fallback: single column
    return [line];
  });
  return table;
}

// POST /process - accepts either a stored filename (json body { file: 'name.pdf' })
// or a direct upload under field 'pdf'. Returns { text, table }.
app.use(express.json());
app.post('/process', upload.single('pdf'), async (req, res) => {
  try {
    let dataBuffer;
    if (req.file) {
      dataBuffer = fs.readFileSync(req.file.path);
    } else if (req.body && req.body.file) {
      const target = path.join(uploadDir, path.basename(req.body.file));
      if (!fs.existsSync(target)) return res.status(404).send({ error: 'file not found' });
      dataBuffer = fs.readFileSync(target);
    } else {
      return res.status(400).send({ error: 'No file uploaded or filename provided' });
    }

  const parsed = await pdf(dataBuffer);
  const text = parsed.text || '';
  const table = textToTable(text);

  // Save table JSON next to the original PDF using a clean base name
  // If the input was an uploaded file, use its original filename without the timestamp prefix
  let sourceName = null;
  if (req.file) sourceName = req.file.originalname || req.file.filename;
  else if (req.body && req.body.file) sourceName = req.body.file;
  sourceName = sourceName ? path.basename(sourceName) : 'output';
  // Remove any leading timestamp like 1760313416568_ from stored names when present
  const cleanName = sourceName.replace(/^\d+_/, '').replace(/\.pdf$/i, '');
  const outName = `${cleanName}_table.json`;
  const outPath = path.join(uploadDir, outName);
  fs.writeFileSync(outPath, JSON.stringify({ text, table }, null, 2), 'utf8');

  res.send({ text, table, saved: outName });
  } catch (err) {
    console.error('Processing error:', err);
    res.status(500).send({ error: 'Processing failed', details: err.message });
  }
});

// Process all PDFs in a folder (default: PDFs/). Optional query: ?folder=subdir
app.post('/process-folder', async (req, res) => {
  try {
    const folder = req.query.folder ? path.join(uploadDir, req.query.folder) : uploadDir;
    if (!fs.existsSync(folder)) return res.status(404).send({ error: 'folder not found' });
    const files = fs.readdirSync(folder).filter(f => /\.pdf$/i.test(f));
    const results = [];
    for (const f of files) {
      const full = path.join(folder, f);
      try {
        const data = fs.readFileSync(full);
        const parsed = await pdf(data);
        const text = parsed.text || '';
        const table = textToTable(text);
        const cleanName = path.basename(f).replace(/^\d+_/, '').replace(/\.pdf$/i, '');
        const outName = `${cleanName}_table.json`;
        fs.writeFileSync(path.join(folder, outName), JSON.stringify({ text, table }, null, 2), 'utf8');
        results.push({ file: f, saved: outName, ok: true });
      } catch (err) {
        results.push({ file: f, ok: false, error: err.message });
      }
    }
    res.send({ results });
  } catch (err) {
    res.status(500).send({ error: 'folder processing failed', details: err.message });
  }
});

// Upload a zip of PDFs, extract into PDFs/ and process extracted PDFs
const zipUpload = multer({ dest: path.join(__dirname, 'tmp') });
app.post('/upload-zip', zipUpload.single('zip'), async (req, res) => {
  if (!req.file) return res.status(400).send({ error: 'No zip uploaded' });
  const extracted = [];
  try {
    await fs.createReadStream(req.file.path)
      .pipe(unzipper.Parse())
      .on('entry', entry => {
        const fileName = entry.path;
        const type = entry.type; // 'Directory' or 'File'
        if (/\.pdf$/i.test(fileName) && type === 'File') {
          const dest = path.join(uploadDir, path.basename(fileName));
          entry.pipe(fs.createWriteStream(dest));
          extracted.push(path.basename(fileName));
        } else {
          entry.autodrain();
        }
      })
      .promise();

    // Process extracted PDFs
    const summary = [];
    for (const f of extracted) {
      try {
        const full = path.join(uploadDir, f);
        const data = fs.readFileSync(full);
        const parsed = await pdf(data);
        const text = parsed.text || '';
        const table = textToTable(text);
        const cleanName = path.basename(f).replace(/^\d+_/, '').replace(/\.pdf$/i, '');
        const outName = `${cleanName}_table.json`;
        fs.writeFileSync(path.join(uploadDir, outName), JSON.stringify({ text, table }, null, 2), 'utf8');
        summary.push({ file: f, saved: outName, ok: true });
      } catch (err) {
        summary.push({ file: f, ok: false, error: err.message });
      }
    }

    res.send({ extracted, summary });
  } catch (err) {
    res.status(500).send({ error: 'zip processing failed', details: err.message });
  } finally {
    // cleanup tmp uploaded zip
    try { fs.unlinkSync(req.file.path); } catch (e) {}
  }
});

app.get('/files', (req, res) => {
  fs.readdir(uploadDir, (err, files) => {
    if (err) return res.status(500).send('Failed to list files');
    res.json(files.filter(f => f !== '.gitkeep'));
  });
});

// ===== INVOICE DISCREPANCY DETECTION ENDPOINTS =====

// POST /process-invoice - Process invoice with discrepancy detection
app.post('/process-invoice', upload.single('pdf'), async (req, res) => {
  try {
    let dataBuffer;
    let filename;

    if (req.file) {
      dataBuffer = fs.readFileSync(req.file.path);
      filename = req.file.filename;
    } else if (req.body && req.body.file) {
      const target = path.join(uploadDir, path.basename(req.body.file));
      if (!fs.existsSync(target)) return res.status(404).send({ error: 'file not found' });
      dataBuffer = fs.readFileSync(target);
      filename = req.body.file;
    } else {
      return res.status(400).send({ error: 'No file uploaded or filename provided' });
    }

    // Extract text from PDF
    const parsed = await pdf(dataBuffer);
    const text = parsed.text || '';

    // Parse invoice structure
    const invoiceData = parseInvoice(text);
    invoiceData.filename = filename;

    // Get configuration from request
    const config = {
      percentageThreshold: parseFloat(req.body.percentageThreshold) || 0.15,
      stdDevThreshold: parseFloat(req.body.stdDevThreshold) || 2,
      mode: req.body.mode || 'both',
      minSamples: parseInt(req.body.minSamples) || 3,
    };

    // Detect discrepancies
    const discrepancyResult = detectDiscrepancies(invoiceData, config);

    // Generate report
    const report = generateReport(invoiceData, discrepancyResult);

    // Save invoice to history
    addInvoice(invoiceData);

    // Update statistics
    updateStatistics();

    // Save report to disk
    const sourceName = req.file?.originalname || req.body.file || filename;
    const cleanName = path.basename(sourceName).replace(/^\d+_/, '').replace(/\.pdf$/i, '');
    const reportPath = path.join(uploadDir, `${cleanName}_report.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');

    res.send({
      invoice: invoiceData,
      discrepancies: discrepancyResult,
      report,
      saved: reportPath,
    });
  } catch (err) {
    console.error('Invoice processing error:', err);
    res.status(500).send({ error: 'Processing failed', details: err.message });
  }
});

// GET /statistics - Get current historical statistics
app.get('/statistics', (req, res) => {
  try {
    const history = loadHistory();

    res.send({
      invoiceCount: history.invoices.length,
      itemCount: Object.keys(history.itemAverages || {}).length,
      vendorCount: Object.keys(history.vendorAverages || {}).length,
      itemAverages: history.itemAverages,
      vendorAverages: history.vendorAverages,
      lastUpdated: history.lastUpdated,
    });
  } catch (err) {
    res.status(500).send({ error: 'Failed to load statistics', details: err.message });
  }
});

// POST /recalculate-statistics - Manually trigger statistics recalculation
app.post('/recalculate-statistics', (req, res) => {
  try {
    const stats = updateStatistics();

    res.send({
      message: 'Statistics recalculated successfully',
      itemCount: Object.keys(stats.itemAverages).length,
      vendorCount: Object.keys(stats.vendorAverages).length,
      stats,
    });
  } catch (err) {
    res.status(500).send({ error: 'Failed to recalculate statistics', details: err.message });
  }
});

// GET /report/:filename - Get HTML report for a specific invoice
app.get('/report/:filename', (req, res) => {
  try {
    const reportFile = path.join(uploadDir, `${req.params.filename}_report.json`);

    if (!fs.existsSync(reportFile)) {
      return res.status(404).send('Report not found. Make sure to process the invoice first.');
    }

    const report = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
    const html = generateHTMLReport(report);

    res.type('html').send(html);
  } catch (err) {
    res.status(500).send({ error: 'Failed to generate report', details: err.message });
  }
});

// GET /report/:filename/text - Get plain text report
app.get('/report/:filename/text', (req, res) => {
  try {
    const reportFile = path.join(uploadDir, `${req.params.filename}_report.json`);

    if (!fs.existsSync(reportFile)) {
      return res.status(404).send('Report not found. Make sure to process the invoice first.');
    }

    const report = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
    const text = generateTextReport(report);

    res.type('text').send(text);
  } catch (err) {
    res.status(500).send({ error: 'Failed to generate report', details: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
