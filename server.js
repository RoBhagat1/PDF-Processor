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

app.get('/files', (req, res) => {
  fs.readdir(uploadDir, (err, files) => {
    if (err) return res.status(500).send('Failed to list files');
    res.json(files.filter(f => f !== '.gitkeep'));
  });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
