import type { Request, Response } from 'express';
import type { EventService } from '../services/eventService.js';

export function createCityController(service: EventService) {
  return {
    async list(_req: Request, res: Response): Promise<void> {
      const { value, status } = await service.cities();
      res.set('X-Cache', status).json({ data: value });
    },
  };
}

export type CityController = ReturnType<typeof createCityController>;

