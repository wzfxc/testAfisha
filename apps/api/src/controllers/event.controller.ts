import type { Request, Response } from 'express';
import {
  EventIdParamsSchema,
  ListEventsQuerySchema,
  UpdateEventBodySchema,
} from '@app/shared';
import { NotFoundError } from '../lib/errors.js';
import type { EventService } from '../services/eventService.js';

function parseEventIdOrNotFound(params: unknown): number {
  const parsed = EventIdParamsSchema.safeParse(params);
  if (!parsed.success) {
    throw new NotFoundError('Event not found');
  }
  return parsed.data.id;
}

export function createEventController(service: EventService) {
  return {
    async list(req: Request, res: Response): Promise<void> {
      const query = ListEventsQuerySchema.parse(req.query);
      const { value, status } = await service.list(query);
      res.set('X-Cache', status).json(value);
    },

    async getById(req: Request, res: Response): Promise<void> {
      const id = parseEventIdOrNotFound(req.params);
      const { value, status } = await service.get(id);
      res.set('X-Cache', status).json({ data: value });
    },

    seats(req: Request, res: Response): void {
      const id = parseEventIdOrNotFound(req.params);
      res.set('Cache-Control', 'no-store').json({ data: service.seats(id) });
    },

    update(req: Request, res: Response): void {
      const id = parseEventIdOrNotFound(req.params);
      const body = UpdateEventBodySchema.parse(req.body);
      res.json({ data: service.update(id, body) });
    },
  };
}

export type EventController = ReturnType<typeof createEventController>;
