import DisputeRepository from '../repositories/dispute.repository.js';
import NotificationService from './notification.service.js';
import {
  disputeCreateSchema,
  disputePatchSchema,
  DISPUTE_TYPES,
  DISPUTE_STATUSES,
  toPositiveInt,
} from '../validators/dispute.validator.js';

class DisputeService {
  /**
   * List disputes
   */
  static async listDisputes(userId, roles, query = {}) {
    const { status, type, page: rawPage, limit: rawLimit } = query;
    const page = toPositiveInt(rawPage, 1);
    const limit = toPositiveInt(rawLimit, 10, 50);

    const dbQuery = {};

    // Users see disputes they're involved in
    if (!roles?.includes('admin')) {
      dbQuery.$or = [
        { initiatorId: userId },
        { respondentId: userId },
      ];
    }

    if (status && status !== 'all' && DISPUTE_STATUSES.includes(status)) {
      dbQuery.status = status;
    }
    if (type && DISPUTE_TYPES.includes(type)) {
      dbQuery.type = type;
    }

    return DisputeRepository.findWithPagination(dbQuery, { page, limit });
  }

  /**
   * File a new dispute
   */
  static async createDispute(userId, data) {
    // Validate
    const parsed = disputeCreateSchema.safeParse(data);
    if (!parsed.success) {
      throw Object.assign(
        new Error('Missing required fields'),
        { statusCode: 400 }
      );
    }

    const {
      respondentId, transactionType, transactionId, type,
      title, description, desiredResolution, claimAmount, currency, evidence,
    } = parsed.data;

    // Check for existing active dispute
    const existingDispute = await DisputeRepository.findActiveByTransaction(
      transactionType, transactionId
    );
    if (existingDispute) {
      throw Object.assign(
        new Error('An active dispute already exists for this transaction'),
        { statusCode: 409, disputeId: existingDispute._id }
      );
    }

    // Create dispute
    const dispute = await DisputeRepository.create({
      initiatorId: userId,
      respondentId,
      transactionType,
      transactionId,
      type,
      title,
      description,
      desiredResolution,
      claimAmount,
      currency: currency || 'USD',
      evidence: evidence || [],
      status: 'filed',
      timeline: [{
        action: 'Dispute filed',
        description: 'Dispute case initiated',
        performedBy: userId,
      }],
    });

    // Update related transaction
    await DisputeRepository.updateRelatedTransaction(
      transactionType, transactionId, dispute._id
    );

    // Notify respondent
    await NotificationService.createNotification({
      userId: respondentId,
      notificationType: 'dispute_filed',
      title: 'Dispute Filed Against You',
      description: `A dispute has been filed regarding ${transactionType} #${transactionId}. "${title}"`,
      data: {
        relatedId: dispute._id,
        relatedModel: 'Dispute',
        actionUrl: `/dashboard/buyer/disputes/${dispute._id}`,
      },
      priority: 'urgent',
    }).catch(err => console.error('Dispute notification error:', err));

    // Notify initiator
    await NotificationService.createNotification({
      userId,
      notificationType: 'dispute_filed',
      title: 'Dispute Filed',
      description: `Your dispute ${dispute.disputeNumber} has been filed. We will review it shortly.`,
      data: {
        relatedId: dispute._id,
        relatedModel: 'Dispute',
        actionUrl: `/dashboard/buyer/disputes/${dispute._id}`,
      },
      priority: 'high',
    }).catch(err => console.error('Dispute notification error:', err));

    return { dispute, message: 'Dispute filed successfully' };
  }

  /**
   * Get single dispute detail
   */
  static async getDispute(session, disputeId) {
    const dispute = await DisputeRepository.findByIdPopulated(disputeId);
    if (!dispute) {
      throw Object.assign(new Error('Dispute not found'), { statusCode: 404 });
    }

    if (!DisputeRepository.canAccess(dispute, session)) {
      throw Object.assign(new Error('Forbidden'), { statusCode: 403 });
    }

    return { dispute };
  }

  /**
   * Update dispute (add message or change status)
   */
  static async updateDispute(session, disputeId, data) {
    // Validate
    const parsed = disputePatchSchema.safeParse(data);
    if (!parsed.success) {
      throw Object.assign(new Error('Invalid update data'), { statusCode: 400 });
    }

    const body = parsed.data;

    // Find dispute
    const dispute = await DisputeRepository.findById(disputeId);
    if (!dispute) {
      throw Object.assign(new Error('Dispute not found'), { statusCode: 404 });
    }

    // Check access
    if (!DisputeRepository.canAccess(dispute, session)) {
      throw Object.assign(new Error('Forbidden'), { statusCode: 403 });
    }

    // Add message
    if (body.message) {
      dispute.messages.push({
        senderId: session.userId,
        message: body.message,
        attachments: body.attachments || [],
      });
      dispute.timeline.push({
        action: 'message_added',
        description: 'Message added to dispute',
        performedBy: session.userId,
      });
    }

    // Update status (admin only)
    if (body.status && session.roles?.includes('admin')) {
      dispute.status = body.status;
      dispute.timeline.push({
        action: 'status_updated',
        description: `Status changed to ${body.status}`,
        performedBy: session.userId,
      });
    }

    await DisputeRepository.save(dispute);

    return { dispute };
  }
}

export default DisputeService;