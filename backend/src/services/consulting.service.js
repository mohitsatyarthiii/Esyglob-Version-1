import ConsultingRepository from '../repositories/consulting.repository.js';
import NotificationService from './notification.service.js';
import {
  consultingInquirySchema,
  CONSULTING_TYPES,
  CONSULTING_STATUSES,
  toPositiveInt,
} from '../validators/consulting.validator.js';

class ConsultingService {
  /**
   * List consulting engagements
   */
  static async listEngagements(userId, roles, query = {}) {
    const { status, type, page: rawPage, limit: rawLimit } = query;
    const page = toPositiveInt(rawPage, 1);
    const limit = toPositiveInt(rawLimit, 10, 50);

    const dbQuery = {};

    if (!roles?.includes('admin')) {
      dbQuery.userId = userId;
    }

    if (status && status !== 'all' && CONSULTING_STATUSES.includes(status)) {
      dbQuery.status = status;
    }
    if (type && CONSULTING_TYPES.includes(type)) {
      dbQuery.type = type;
    }

    return ConsultingRepository.findWithPagination(dbQuery, { page, limit });
  }

  /**
   * Create consulting inquiry
   */
  static async createInquiry(userId, data) {
    // Validate
    const parsed = consultingInquirySchema.safeParse(data);
    if (!parsed.success) {
      throw Object.assign(
        new Error('Missing required fields: type, description'),
        { statusCode: 400 }
      );
    }

    const {
      type, title, description, objectives,
      scope, preferredTimeline, budget, currency,
    } = parsed.data;

    // Create engagement
    const engagement = await ConsultingRepository.create({
      userId,
      type,
      title: title || `${type.replace(/_/g, ' ')} Consultation`,
      description,
      scope: {
        objectives: objectives || [],
        deliverables: scope?.deliverables || [],
        methodology: scope?.methodology || 'To be determined during consultation',
      },
      startDate: preferredTimeline?.start || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      estimatedDuration: preferredTimeline?.duration || '2-4 weeks',
      fee: budget || 0,
      currency: currency || 'USD',
      status: 'inquiry',
    });

    // Notify
    await NotificationService.createNotification({
      userId,
      notificationType: 'consulting_inquiry',
      title: 'Consulting Inquiry Submitted',
      description: `Your ${type.replace(/_/g, ' ')} consulting inquiry has been submitted. We'll match you with an expert shortly.`,
      data: {
        relatedId: engagement._id,
        relatedModel: 'ConsultingEngagement',
        actionUrl: `/dashboard/buyer/consulting/${engagement._id}`,
      },
      priority: 'high',
    }).catch(err => console.error('Consulting notification error:', err));

    return { engagement, message: 'Consulting inquiry submitted successfully' };
  }
}

export default ConsultingService;