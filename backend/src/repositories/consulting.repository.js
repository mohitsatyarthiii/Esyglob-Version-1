import ConsultingEngagement from '../models/ConsultingEngagement.js';

class ConsultingRepository {
  /**
   * Find engagements with pagination
   */
  static async findWithPagination(query, { page = 1, limit = 10 } = {}) {
    const skip = (page - 1) * limit;

    const [engagements, total] = await Promise.all([
      ConsultingEngagement.find(query)
        .populate('userId', 'email fullName')
        .populate('consultantId', 'email fullName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      ConsultingEngagement.countDocuments(query),
    ]);

    return {
      engagements,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  /**
   * Create engagement
   */
  static async create(data) {
    return ConsultingEngagement.create(data);
  }
}

export default ConsultingRepository;