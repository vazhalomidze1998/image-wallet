import type { Request, Response } from 'express';
import { getUserId } from '../middleware/authenticate';
import * as imageService from '../services/image.service';
import * as transformService from '../services/transform.service';
import type { TransformBody } from '../schemas/transform.schema';
import type { IdParam, PaginationQuery } from '../schemas/common.schema';

export async function upload(req: Request, res: Response) {
  const image = await imageService.uploadImage(getUserId(req), req.file);
  res.status(201).json({ success: true, data: image });
}

export async function list(req: Request, res: Response) {
  const { page, limit } = req.query as unknown as PaginationQuery;
  const result = await imageService.listImages(getUserId(req), page, limit);
  res.json({ success: true, ...result });
}

export async function getOne(req: Request, res: Response) {
  const { id } = req.params as IdParam;
  const image = await imageService.getImage(getUserId(req), id);
  res.json({ success: true, data: image });
}

export async function remove(req: Request, res: Response) {
  const { id } = req.params as IdParam;
  await imageService.deleteImage(getUserId(req), id);
  res.status(204).send();
}

export async function transform(req: Request, res: Response) {
  const { id } = req.params as IdParam;
  const { transformations } = req.body as TransformBody;
  const variant = await transformService.transformImage(getUserId(req), id, transformations);
  res.status(variant.cached ? 200 : 201).json({ success: true, data: variant });
}
