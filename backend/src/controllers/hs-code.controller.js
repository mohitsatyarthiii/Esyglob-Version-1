import HSCodeService from '../services/hs-code.service.js';

export async function search(req, res, next) { try { res.json(await HSCodeService.search({ query: req.query.q || req.query.query, countryCode: req.query.countryCode, page: req.query.page, limit: req.query.limit })); } catch (error) { next(error); } }
export async function getByCode(req, res, next) { try { res.json({ item: await HSCodeService.getByCode(req.params.code) }); } catch (error) { next(error); } }
