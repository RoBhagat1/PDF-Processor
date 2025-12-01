# PDF Processor

Building a bulk PDF scanning system to deliver automated data extraction and anomaly detection

A bulk PDF scanning feature, intedned to validate the data extraction by using the validation rules, and sending the data to the ML system for predicting and learning the anomalies.

Currently:
Simple Node/Express app that accepts PDF uploads and stores them in the `PDFs/` folder.

Quick start:

1. Install dependencies: npm install
2. Start server: npm start
3. Open http://localhost:3000 and upload a PDF. Files will be stored in `PDFs/`.

API:

- POST /upload - multipart form field `pdf` (file). Returns JSON { message, file } on success.
- GET /files - returns JSON list of uploaded filenames.

