import { Router } from 'express';
import KnowledgeBaseController from '../controllers/knowledge-base.controller.js';
import { authenticate, requireAuth, requireRole } from '../middlewares/auth.middleware.js';
import multer from 'multer';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: Number(process.env.AI_KNOWLEDGE_MAX_FILE_BYTES || 15 * 1024 * 1024) },
  fileFilter(_req, file, callback) {
    const allowed = new Set([
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'text/markdown',
      'text/html',
      'application/octet-stream',
    ]);
    callback(allowed.has(file.mimetype) ? null : new Error('Use PDF, DOCX, Markdown, HTML, or TXT files.'), allowed.has(file.mimetype));
  },
});
router.use(authenticate, requireAuth, requireRole('admin'));
router.get('/', KnowledgeBaseController.list);
router.post('/', KnowledgeBaseController.upsert);
router.put('/', KnowledgeBaseController.upsert);
router.post('/ingest', upload.single('file'), KnowledgeBaseController.ingest);

export default router;
