import { Router } from 'express';
import type { EventController } from '../controllers/event.controller.js';

export function createEventRoutes(controller: EventController): Router {
  const router = Router();

  router.get('/', controller.list);
  // Register the more specific `/:id/seats` route; order is irrelevant for
  // Express matching here but keeps related routes together.
  router.get('/:id/seats', controller.seats);
  router.get('/:id', controller.getById);
  router.patch('/:id', controller.update);

  return router;
}

