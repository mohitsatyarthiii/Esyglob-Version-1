import mongoose from 'mongoose';
import * as rfqService from '../services/rfq.service.js';
import { toPositiveInt } from '../lib/rfq-helpers.js';
import { getSession } from '../lib/session.js';

// ─── GET /api/rfqs ─────────────────────────────────────────
export async function getRfqs(req, res, next) {
  try {
    const session = await getSession(req);

    const result = await rfqService.getRfqs(session, req.query);

    return res.json(result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error('RFQ fetch error:', error);
    return res.status(500).json({ error: 'Failed to fetch RFQs' });
  }
}

// ─── POST /api/rfqs ────────────────────────────────────────
export async function createRfq(req, res, next) {
  try {
    const session = await getSession(req);

    if (!session?.userId || !session?.roles?.includes('buyer')) {
      return res.status(403).json({ error: 'Only buyers can create RFQs' });
    }

    const result = await rfqService.createRfq(session, req.body);

    return res.status(201).json(result);
  } catch (error) {
    if (error.statusCode) {
      return res
        .status(error.statusCode)
        .json({ error: error.message, contactInfoBlocked: error.contactInfoBlocked });
    }
    console.error('RFQ creation error:', error);
    return res.status(500).json({ error: 'Failed to create RFQ' });
  }
}

// ─── GET /api/rfqs/:rfqId ──────────────────────────────────
export async function getRfqDetail(req, res, next) {
  try {
    const session = await getSession(req);

    if (!mongoose.Types.ObjectId.isValid(req.params.rfqId)) {
      return res.status(404).json({ error: 'RFQ not found' });
    }

    const result = await rfqService.getRfqDetail(session, req.params.rfqId);

    return res.json(result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error('RFQ fetch error:', error);
    return res.status(500).json({ error: 'Failed to fetch RFQ' });
  }
}

// ─── PATCH /api/rfqs/:rfqId ────────────────────────────────
export async function updateRfq(req, res, next) {
  try {
    const session = await getSession(req);

    if (!session?.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!mongoose.Types.ObjectId.isValid(req.params.rfqId)) {
      return res.status(404).json({ error: 'RFQ not found' });
    }

    const result = await rfqService.updateRfq(session, req.params.rfqId, req.body);

    return res.json(result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error('RFQ update error:', error);
    return res.status(500).json({ error: 'Failed to update RFQ' });
  }
}

// ─── DELETE /api/rfqs/:rfqId ───────────────────────────────
export async function deleteRfq(req, res, next) {
  try {
    const session = await getSession(req);

    if (!session?.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!mongoose.Types.ObjectId.isValid(req.params.rfqId)) {
      return res.status(404).json({ error: 'RFQ not found' });
    }

    const result = await rfqService.deleteRfq(session, req.params.rfqId);

    return res.json(result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error('RFQ deletion error:', error);
    return res.status(500).json({ error: 'Failed to delete RFQ' });
  }
}

// ─── POST /api/rfqs/product-enquiry ────────────────────────
export async function createProductEnquiry(req, res, next) {
  try {
    const session = await getSession(req);

    if (!session?.userId || !session.roles?.includes('buyer')) {
      return res.status(403).json({ error: 'Buyer access required' });
    }

    const result = await rfqService.createProductEnquiry(session, req.body);

    return res.status(201).json(result);
  } catch (error) {
    if (error.statusCode) {
      return res
        .status(error.statusCode)
        .json({ error: error.message, contactInfoBlocked: error.contactInfoBlocked });
    }
    console.error('Product enquiry RFQ error:', error);
    return res.status(500).json({ error: 'Failed to submit enquiry' });
  }
}

// mongoose import at top needed for the controller
