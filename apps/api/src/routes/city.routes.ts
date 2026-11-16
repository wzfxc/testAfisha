import { Router } from 'express';
import type { CityController } from '../controllers/city.controller.js';
import { methodNotAllowed } from '../middlewares/errorHandler.js';

export function createCityRoutes(controller: CityController): Router {
  const router = Router();
  router.get('/', controller.list);
  router.all('/', methodNotAllowed('GET, HEAD'));
  return router;
}
