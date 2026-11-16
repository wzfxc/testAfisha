import { Router } from 'express';
import type { EventController } from '../controllers/event.controller.js';
import { methodNotAllowed, requireJsonContentType } from '../middlewares/errorHandler.js';

export function createEventRoutes(controller: EventController): Router {
  const router = Router();

  router.get('/', controller.list);
  router.all('/', methodNotAllowed('GET, HEAD'));

  router.get('/:id/seats', controller.seats);
  router.all('/:id/seats', methodNotAllowed('GET, HEAD'));

  router.get('/:id', controller.getById);
  router.patch('/:id', requireJsonContentType, controller.update);
  router.all('/:id', methodNotAllowed('GET, HEAD, PATCH'));

  return router;
}
