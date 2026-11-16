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
  if (raw === undefined || raw === null) {
    return undefined;
  }
  if (typeof raw !== 'string') {
    return raw;
  }
  const trimmed = raw.trim();
  if (trimmed === '' || trimmed === 'undefined' || trimmed === 'null') {
    return undefined;
  }
  return trimmed;
}, z.string().max(100).optional());

const positivePage = z.preprocess((val) => {
  const raw = Array.isArray(val) ? val[0] : val;
  if (raw === undefined || raw === null || raw === '') {
    return 1;
  }
  return typeof raw === 'string' ? Number(raw) : raw;
}, z.number().int().min(1));

const boundedLimit = z.preprocess((val) => {
  const raw = Array.isArray(val) ? val[0] : val;
  if (raw === undefined || raw === null || raw === '') {
    return 12;
  }
  return typeof raw === 'string' ? Number(raw) : raw;
}, z.number().int().min(1).max(50));

export const ListEventsQuerySchema = z.object({
  city: optionalText,
  q: optionalText,
  page: positivePage,
  limit: boundedLimit,
});

export type ListEventsQuery = z.infer<typeof ListEventsQuerySchema>;
export const listEventsQuerySchema = ListEventsQuerySchema;

export const EventIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export type EventIdParams = z.infer<typeof EventIdParamsSchema>;
export const eventIdParamsSchema = EventIdParamsSchema;

export const EVENT_TITLE_MIN = 3;
export const EVENT_TITLE_MAX = 120;
export const EVENT_DESCRIPTION_MIN = 10;
export const EVENT_DESCRIPTION_MAX = 2000;

export const UpdateEventBodySchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(EVENT_TITLE_MIN, `Title must be at least ${EVENT_TITLE_MIN} characters`)
      .max(EVENT_TITLE_MAX, `Title must be at most ${EVENT_TITLE_MAX} characters`)
      .optional(),
    description: z
      .string()
      .trim()
      .min(EVENT_DESCRIPTION_MIN, `Description must be at least ${EVENT_DESCRIPTION_MIN} characters`)
      .max(EVENT_DESCRIPTION_MAX, `Description must be at most ${EVENT_DESCRIPTION_MAX} characters`)
      .optional(),
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

export const ErrorDetailSchema = z.object({
  field: z.string(),
  message: z.string(),
});

export type ErrorDetail = z.infer<typeof ErrorDetailSchema>;

export const ApiErrorBodySchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.array(ErrorDetailSchema).optional(),
  requestId: z.string(),
});

export type ApiErrorBody = z.infer<typeof ApiErrorBodySchema>;

export const ApiErrorResponseSchema = z.object({
  error: ApiErrorBodySchema,
});

export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;
