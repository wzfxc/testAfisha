import { Router } from 'express';
import type { CityController } from '../controllers/city.controller.js';

export function createCityRoutes(controller: CityController): Router {
  const router = Router();
  router.get('/', controller.list);
  return router;
}

