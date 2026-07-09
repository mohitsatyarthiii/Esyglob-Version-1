import mongoose from 'mongoose';
import * as quotationService from '../services/quotation.service.js';
import { getSession } from '../lib/session.js';
import { toPositiveInt } from '../lib/rfq-helpers.js';

// ─── GET /api/quotations ───────────────────────────────────
export async function getQuotations(req, res, next) {
  try {
    const session = await getSession(req);

    if (!session?.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const result = await quotationService.getQuotations(session, req.query);

    return res.json(result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error('Quotation fetch error:', error);
    return res.status(500).json({ error: 'Failed to fetch quotations' });
  }
}

// ─── POST /api/quotations ──────────────────────────────────
export async function createQuotation(req, res, next) {
  try {
    const session = await getSession(req);

    if (!session?.userId || !session?.roles?.includes('seller')) {
      return res.status(403).json({ error: 'Only sellers can create quotations' });
    }

    const result = await quotationService.createQuotation(session, req.body);

    return res.status(201).json(result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        error: error.message,
        contactInfoBlocked: error.contactInfoBlocked,
        quotationId: error.quotationId,
      });
    }
    console.error('Quotation creation error:', error);
    return res.status(500).json({ error: 'Failed to create quotation' });
  }
}

// ─── GET /api/quotations/:quotationId ──────────────────────
export async function getQuotationDetail(req, res, next) {
  try {
    const session = await getSession(req);

    if (!session?.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { quotationId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(quotationId)) {
      return res.status(404).json({ error: 'Quotation not found' });
    }

    const result = await quotationService.getQuotationDetail(session, quotationId);

    return res.json(result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error('Quotation fetch error:', error);
    return res.status(500).json({ error: 'Failed to fetch quotation' });
  }
}

// ─── PATCH /api/quotations/:quotationId ────────────────────
export async function updateQuotation(req, res, next) {
  try {
    const session = await getSession(req);

    if (!session?.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { quotationId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(quotationId)) {
      return res.status(404).json({ error: 'Quotation not found' });
    }

    const result = await quotationService.updateQuotation(
      session,
      quotationId,
      req.body
    );

    return res.json(result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        error: error.message,
        contactInfoBlocked: error.contactInfoBlocked,
      });
    }
    console.error('Quotation update error:', error);
    return res.status(500).json({ error: 'Failed to update quotation' });
  }
}

// ─── PUT /api/quotations/:quotationId (Accept/Reject) ──────
export async function respondToQuotation(req, res, next) {
  try {
    const session = await getSession(req);

    if (!session?.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { quotationId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(quotationId)) {
      return res.status(404).json({ error: 'Quotation not found' });
    }

    const result = await quotationService.respondToQuotation(
      session,
      quotationId,
      req.body
    );

    return res.json(result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        error: error.message,
        contactInfoBlocked: error.contactInfoBlocked,
      });
    }
    console.error('Quotation action error:', error);
    return res.status(500).json({ error: 'Failed to process quotation' });
  }
}