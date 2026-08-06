import express from 'express';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import { corsMiddleware } from './server/middleware/corsMiddleware.js';
import { initDatabaseSchema } from './server/database/schema.js';
import apiRouter from './server/routes/index.js';
import { runAutoBillingJob } from './server/models/invoiceModel.js';

dotenv.config();

// Global error handlers to prevent crash from node-routeros unhandled exceptions
process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION] Server tetap berjalan:', err.message);
});
process.on('unhandledRejection', (reason: any) => {
  console.error('[UNHANDLED REJECTION] Server tetap berjalan:', reason?.message || reason);
});

const app = express();
const port = process.env.PORT || 3006;

app.use(express.json());
app.use(cookieParser());
app.use(corsMiddleware);

// Initialize DB schema & patch tables
initDatabaseSchema();

// Mount all API endpoints under /api
app.use('/api', apiRouter);

// Run Auto-Billing Scheduler Job every 12 hours automatically
setInterval(() => {
  runAutoBillingJob(5).catch(() => {});
}, 12 * 60 * 60 * 1000);

app.listen(port, () => {
  console.log(`ArbilBaru Database Backend API running on port ${port}`);
});
