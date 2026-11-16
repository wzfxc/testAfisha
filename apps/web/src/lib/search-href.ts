export function buildHref(
  pathname: string,
  values: { city?: string; q?: string; page?: number },
): string {
  const params = new URLSearchParams();
  const cleanCity = values.city?.trim() ?? '';
  const cleanQ = values.q?.trim() ?? '';
  const targetPage = values.page ?? 1;

  if (cleanCity.length > 0) {
    params.set('city', cleanCity);
  }
  if (cleanQ.length > 0) {
    params.set('q', cleanQ);
  }
  if (targetPage > 1) {
    params.set('page', String(targetPage));
  }

  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

