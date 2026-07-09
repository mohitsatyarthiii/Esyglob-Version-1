import ContactLeadRepository from '../repositories/contact-lead.repository.js';
import { contactSchema } from '../validators/contact.validator.js';

class ContactLeadService {
  /**
   * Submit contact form
   */
  static async submitContact(data, ip, userId) {
    // Validate
    const parsed = contactSchema.safeParse(data);
    if (!parsed.success) {
      throw Object.assign(
        new Error('Please complete the required contact fields.'),
        { statusCode: 422 }
      );
    }

    const { firstName, lastName, name, email, phone, company, subject, message, country } = parsed.data;
    const fullName = name || [firstName, lastName].filter(Boolean).join(' ');

    // Create lead
    const lead = await ContactLeadRepository.create({
      name: fullName,
      email,
      phone,
      company,
      subject,
      message,
      country,
      userId: userId || undefined,
      ip,
      status: 'new',
    });

    return {
      success: true,
      leadId: lead._id,
      message: 'Thanks. Your message has been saved and our team will follow up shortly.',
    };
  }
}

export default ContactLeadService;