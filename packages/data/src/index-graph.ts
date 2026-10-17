/**
 * 04-graph: adapter from the normalized model to `buildGraph` in
 * `@theographic/core`. People and places carry their full mention lists
 * (the same `verses` the detail bundles ship); events carry the verses
 * that describe them plus their participants and locations. Nothing here
 * knows the byte layout.
 */
import { buildGraph, type GraphBuild, type GraphRows } from '@theographic/core';
import type { Normalized } from './normalize.js';

export function graphRows(n: Normalized): GraphRows {
  return {
    people: n.people.map((p) => ({
      slug: p.slug,
      verses: n.personDetail.get(p.slug)?.verses ?? [],
    })),
    places: n.places.map((p) => ({
      slug: p.slug,
      verses: n.placeDetail.get(p.slug)?.verses ?? [],
    })),
    events: n.events.map((e) => ({
      slug: e.slug,
      verses: e.verses,
      ...(e.participants ? { participants: e.participants } : {}),
      ...(e.locations ? { locations: e.locations } : {}),
    })),
  };
}

export function buildGraphBundle(n: Normalized): GraphBuild {
  return buildGraph(graphRows(n));
}
