import * as contactService from '../services/contact.service.js';
import { getSession } from '../lib/session.js';

export async function getContacts(req, res, next) {
  try {
    const session = await getSession(req);

    if (!session?.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const requestedRole = req.query.role || session.primaryRole || 'buyer';

    const result = await contactService.getContacts(session, {
      role: requestedRole,
    });

    return res.json(result);
  } catch (error) {
    console.error('Messenger contacts error:', error);
    return res.status(500).json({ error: 'Unable to load contacts' });
  }
}