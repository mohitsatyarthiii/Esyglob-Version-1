import ContactLead from '../models/ContactLead.js';

class ContactLeadRepository {
  /**
   * Create contact lead
   */
  static async create(data) {
    return ContactLead.create(data);
  }
}

export default ContactLeadRepository;