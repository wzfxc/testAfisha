// Deterministic generator for data/events.json (60 events).
// Run: npm run generate:data
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../data/events.seed.json', import.meta.url));

const venuesByCity = {
  Kyiv: ['Palace of Sports', 'Atlas Hall', 'Stereo Plaza'],
  Lviv: ['Opera House', 'Lviv Arena', 'Dovzhenko Centre'],
  Odesa: ['Green Theatre', 'Port Hall', 'Odesa Philharmonic'],
  Kharkiv: ['Maxim Gorky Park', 'Kharkiv Palace', 'Club Hub 42'],
  Dnipro: ['Dnipro Arena', 'Mystetskyi Dvir', 'Zaporizhzhia Hall'],
  Warsaw: ['Torwar Hall', 'Palace of Culture', 'Progresja'],
  Berlin: ['Tempodrom', 'Columbiahalle', 'Funkhaus'],
  Prague: ['O2 Arena', 'Lucerna Hall', 'Rudolfinum'],
};

const kinds = [
  ['Jazz Night', 'An intimate evening of live jazz with a rotating line-up of local and guest musicians.', 80, 400],
  ['Tech Conference', 'A full-day conference with talks, workshops and networking for software engineers.', 300, 3000],
  ['Stand-up Show', 'A stand-up comedy show featuring headliners and rising stars of the scene.', 100, 800],
  ['Food Festival', 'Street food, chefs\' stages and tastings from dozens of regional kitchens.', 500, 5000],
  ['Indie Rock Concert', 'Guitars, loud amps and an energetic crowd: a night of indie rock bands.', 200, 2500],
  ['Art Exhibition', 'A curated exhibition of contemporary painting, photography and installations.', 50, 600],
  ['City Marathon', 'A city-wide road race with 5K, 10K and half-marathon distances for all levels.', 1000, 5000],
  ['Startup Pitch Night', 'Ten early-stage startups pitch to investors and a live audience.', 100, 500],
  ['Classical Evening', 'A symphony orchestra performs masterpieces of the classical repertoire.', 300, 1500],
  ['Film Festival', 'A multi-day showcase of independent shorts and feature films with Q&A sessions.', 150, 1200],
  ['Board Game Convention', 'Open tables, tournaments and new releases for board game fans of all ages.', 200, 1500],
  ['Wine Tasting', 'A guided tasting of boutique wines paired with local cheeses.', 30, 200],
];

const adjectives = ['Grand', 'Winter', 'Midnight', 'Open-Air', 'Annual', 'Golden', 'Urban', 'Spring', 'Sunset', 'Royal'];

// Small seeded PRNG (mulberry32) so the file is reproducible.
let seed = 20261116;
function rand() {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const between = (min, max) => min + Math.floor(rand() * (max - min + 1));

const cities = Object.keys(venuesByCity);
const start = Date.UTC(2026, 11, 1, 0, 0, 0); // 2026-12-01
const events = [];

for (let i = 1; i <= 60; i++) {
  const [kind, description, minCap, maxCap] = pick(kinds);
  const city = cities[(i - 1 + between(0, 2)) % cities.length];
  const venue = pick(venuesByCity[city]);
  const date = new Date(start + between(0, 300) * 86_400_000 + between(10, 21) * 3_600_000);
  const capacity = Math.round(between(minCap, maxCap) / 10) * 10;
  events.push({
    id: i,
    title: `${pick(adjectives)} ${kind} #${i}`,
    description: `${description} Hosted in ${city} at ${venue}.`,
    city,
    venue,
    date: date.toISOString(),
    capacity,
  });
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(events, null, 2) + '\n');
console.log(`Wrote ${events.length} events to ${OUT}`);

