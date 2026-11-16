import { Router } from 'express';
import { createCityController } from '../controllers/city.controller.js';
import { createEventController } from '../controllers/event.controller.js';
import type { EventService } from '../services/eventService.js';
import { createCityRoutes } from './city.routes.js';
import { createEventRoutes } from './event.routes.js';

export function createApiRoutes(eventService: EventService): Router {
  const router = Router();

  const eventController = createEventController(eventService);
  const cityController = createCityController(eventService);

  router.use('/events', createEventRoutes(eventController));
  router.use('/cities', createCityRoutes(cityController));

  return router;
}

