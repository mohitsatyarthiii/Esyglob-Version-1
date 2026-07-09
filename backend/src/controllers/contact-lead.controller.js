import ContactLeadService from '../services/contact-lead.service.js';

class ContactLeadController {
  /**
   * POST - Submit contact form
   */
  static async submit(req, res) {
    try {
      const ip = req.ip || req.connection?.remoteAddress || 'unknown';
      const userId = req.user?._id || null;

      const result = await ContactLeadService.submitContact(req.body, ip, userId);
      return res.status(201).json(result);
    } catch (error) {
      console.error('[Contact-Lead] Error:', error);

      if (error.statusCode === 422) {
        return res.status(422).json({ error: error.message });
      }

      return res.status(500).json({ error: 'Unable to submit contact request.' });
    }
  }
}

export default ContactLeadController;