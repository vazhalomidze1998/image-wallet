import { Router } from 'express';
import * as imageController from '../controllers/image.controller';
import { authenticate } from '../middleware/authenticate';
import { imageUploadLimiter, transformLimiter } from '../middleware/rateLimit';
import { uploadImage } from '../middleware/upload';
import { validate } from '../middleware/validate';
import { idParamSchema, paginationQuerySchema } from '../schemas/common.schema';
import { transformBodySchema } from '../schemas/transform.schema';

export const imageRouter = Router();

imageRouter.use(authenticate);

imageRouter.post('/', imageUploadLimiter, uploadImage, imageController.upload);
imageRouter.get('/', validate({ query: paginationQuerySchema }), imageController.list);
imageRouter.get('/:id', validate({ params: idParamSchema }), imageController.getOne);
imageRouter.post(
  '/:id/transform',
  transformLimiter,
  validate({ params: idParamSchema, body: transformBodySchema }),
  imageController.transform,
);
imageRouter.delete('/:id', validate({ params: idParamSchema }), imageController.remove);
