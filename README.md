# PDF Processor

Simple Node/Express app that accepts PDF uploads and stores them in the `PDFs/` folder.

Quick start:

1. Install dependencies: npm install
2. Start server: npm start
3. Open http://localhost:3000 and upload a PDF. Files will be stored in `PDFs/`.

API:

- POST /upload - multipart form field `pdf` (file). Returns JSON { message, file } on success.
- GET /files - returns JSON list of uploaded filenames.

