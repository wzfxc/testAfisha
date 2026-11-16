import { z } from 'zod';

/**
 * Core Event schema representing a single record in the events dataset.
 */
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

/** Alias for backwards compatibility inside the API layer */
export const eventRecordSchema = EventSchema;
export type EventRecord = Event;

/** Empty string -> undefined so `?city=` behaves like "no filter". */
const optionalText = z
  .string()
  .trim()
  .max(100)
  .optional()
  .transform((value) => (value === '' ? undefined : value));

/**
 * Query parameters schema for `GET /events`.
 */
export const ListEventsQuerySchema = z.object({
  city: optionalText,
  q: optionalText,
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12),
});

export type ListEventsQuery = z.infer<typeof ListEventsQuerySchema>;
export const listEventsQuerySchema = ListEventsQuerySchema;

/**
 * Route params schema for `/events/:id` and `/events/:id/seats`.
 */
export const EventIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export type EventIdParams = z.infer<typeof EventIdParamsSchema>;
export const eventIdParamsSchema = EventIdParamsSchema;

/**
 * Request body schema for `PATCH /events/:id`.
 */
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

/**
 * Shared filter, pagination, and seats response schemas & types.
 */
export interface EventFilter {
  /** Case-insensitive exact city match. */
  city?: string | undefined;
  /** Case-insensitive substring search over the title. */
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

