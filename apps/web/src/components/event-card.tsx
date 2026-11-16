import Link from 'next/link';
import { Calendar, MapPin, Pencil, Users } from 'lucide-react';
import type { Event } from '@app/shared';
import { FavoriteButton } from '@/components/favorite-button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { formatEventDate } from '@/lib/utils';

export interface EventCardProps {
  event: Event;
}

export function EventCard({ event }: EventCardProps) {
  return (
    <Card className="flex h-full flex-col justify-between transition-colors hover:border-slate-300">
      <div>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div className="space-y-1.5">
            <Badge variant="default">{event.city}</Badge>
            <CardTitle>
              <Link
                href={`/events/${event.id}`}
                prefetch={false}
                className="hover:text-blue-600 hover:underline"
              >
                {event.title}
              </Link>
            </CardTitle>
          </div>
          <FavoriteButton eventId={event.id} />
        </CardHeader>

        <CardContent className="space-y-3">
          <p className="line-clamp-2 text-sm text-slate-600">
            {event.description}
          </p>

          <dl className="space-y-1.5 border-t border-slate-100 pt-3 text-xs text-slate-600">
            <div className="flex items-center gap-2">
              <Calendar className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              <dd>{formatEventDate(event.date)}</dd>
            </div>
            <div className="flex items-center gap-2">
              <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              <dd className="truncate">
                {event.venue}, {event.city}
              </dd>
            </div>
            <div className="flex items-center gap-2">
              <Users className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              <dd>Capacity: {event.capacity.toLocaleString()} seats</dd>
            </div>
          </dl>
        </CardContent>
      </div>

      <CardFooter>
        <Link
          href={`/events/${event.id}`}
          prefetch={false}
          className="text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline"
        >
          View details & live seats &rarr;
        </Link>

        <Link
          href={`/events/${event.id}/edit`}
          prefetch={false}
          className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800"
        >
          <Pencil className="h-3 w-3" />
          <span>Edit</span>
        </Link>
      </CardFooter>
    </Card>
  );
}
