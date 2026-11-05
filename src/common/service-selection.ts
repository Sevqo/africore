import {z} from 'zod';
/** Bound onboarding work without tying catalog growth to an obsolete UI count. */
export const serviceSelectionInput=z.array(z.string().regex(/^[a-z][a-z0-9_]{1,60}$/)).max(100).refine(values=>new Set(values).size===values.length,'Select each service once').default([]);
