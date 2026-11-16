import { z } from 'zod';

export const EventSchema = z.object({
  id: z.number().int().positive(),
  title: z.string().min(1),
  description: z.string(),
  city: z.string().min(1),
  venue: z.string().min(1),
  date: z.iso.datetime(),
  capacity: z.number().int().nonnegative(),
});

export type Event = z.infer<typeof EventSchema>;

export const eventRecordSchema = EventSchema;
export type EventRecord = Event;

const optionalText = z.preprocess((val) => {
  const raw = Array.isArray(val) ? val[0] : val;
  if (typeof raw !== 'string') {
    return undefined;
  }
  const trimmed = raw.trim();
  if (trimmed === '' || trimmed === 'undefined' || trimmed === 'null') {
    return undefined;
  }
  return trimmed;
}, z.string().max(100).optional());

export const ListEventsQuerySchema = z.object({
  city: optionalText,
  q: optionalText,
  page: z.preprocess((val) => {
    const raw = Array.isArray(val) ? val[0] : val;
    if (raw === undefined || raw === null || raw === '') {
      return 1;
    }
    return raw;
  }, z.coerce.number().int().min(1).catch(1)),
  limit: z.preprocess((val) => {
    const raw = Array.isArray(val) ? val[0] : val;
    if (raw === undefined || raw === null || raw === '') {
      return 12;
    }
    return raw;
  }, z.coerce.number().int().min(1).max(50).catch(12)),
});

export type ListEventsQuery = z.infer<typeof ListEventsQuerySchema>;
export const listEventsQuerySchema = ListEventsQuerySchema;

export const EventIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export type EventIdParams = z.infer<typeof EventIdParamsSchema>;
export const eventIdParamsSchema = EventIdParamsSchema;

export const UpdateEventBodySchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().min(1).max(5000).optional(),
  })
  .strict()
  .refine((body) => body.title !== undefined || body.description !== undefined, {
    message: 'Provide at least one of: title, description',
  });

export type UpdateEventBody = z.infer<typeof UpdateEventBodySchema>;
export const updateEventBodySchema = UpdateEventBodySchema;

export interface EventFilter {
  city?: string | undefined;
  q?: string | undefined;
}

export const PaginationMetaSchema = z.object({
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

export type PaginationMeta = z.infer<typeof PaginationMetaSchema>;

export const PaginatedEventsSchema = z.object({
  data: z.array(EventSchema),
  meta: PaginationMetaSchema,
});

export type PaginatedEvents = z.infer<typeof PaginatedEventsSchema>;

export const SeatsInfoSchema = z.object({
  eventId: z.number().int().positive(),
  capacity: z.number().int().nonnegative(),
  availableSeats: z.number().int().nonnegative(),
});

export type SeatsInfo = z.infer<typeof SeatsInfoSchema>;
