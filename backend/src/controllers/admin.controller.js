import * as service from '../services/admin.service.js';

const send = (handler) => async (req, res, next) => {
  try {
    const result = await handler(req);
    return res.json({ data: result });
  } catch (error) {
    return next(error);
  }
};

export const overview = send(() => service.getOverview());
export const list = send((req) => service.list(req.params.resource, req.query));
export const get = send((req) => service.get(req.params.resource, req.params.id));
export const create = send((req) => service.create(req.params.resource, req.body, req.user, requestMetadata(req)));
export const update = send((req) => service.update(req.params.resource, req.params.id, req.body, req.user, requestMetadata(req)));
export const remove = send(async (req) => {
  await service.remove(req.params.resource, req.params.id, req.user, requestMetadata(req));
  return { deleted: true };
});
export const action = send((req) => service.action(req.params.resource, req.params.id, req.body, req.user, requestMetadata(req)));
export const reviewDocument = send((req) => service.reviewDocument(req.params.id, req.params.documentId, req.body, req.user, requestMetadata(req)));

function requestMetadata(req) {
  return { ipAddress: req.ip, userAgent: String(req.get('user-agent') || '').slice(0, 500), requestId: req.id };
}
