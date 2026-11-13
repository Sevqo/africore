import {discoveryPages} from "./education/discoveryPages";
import {serviceEducation} from "./education/serviceEducation";
import {learningPaths} from "./education/learningPaths";
import { renderToString } from "react-dom/server";
import { App } from "./App";
import { pages } from "./content";
import { appCatalog } from "../../src/apps/catalog";
import { lessons } from "./education/Learn";
import { pageMetadata } from "./education/metadata";
export const publicPaths = [
  "/",
  "/docs",
  "/apps",
  ...appCatalog.map(app=>"/apps/"+app.id),
  ...Object.keys(discoveryPages),
  ...Object.values(serviceEducation).map(s=>s.route),
  ...Object.keys(pages),
  "/learn",
  "/learn/glossary",
  ...Object.keys(learningPaths).map(slug=>"/learn/"+slug),
  ...Object.keys(lessons).map((slug) => "/learn/" + slug),
];
export function renderPublic(path: string) {
  (globalThis as any).window = { location: { pathname: path, search: "" } };
  (globalThis as any).location = { pathname: path, search: "" };
  return { html: renderToString(<App />), ...pageMetadata(path) };
}
