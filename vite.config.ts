// vite.config.ts
// Serveur de DÉVELOPPEMENT uniquement (`npm run dev`). En production, Vercel
// sert `public/` en statique et `api/` en fonction : ce fichier n'y intervient
// pas du tout.
//
// Son seul rôle est de recréer en local le routage que Vercel fait tout seul,
// pour qu'on puisse voir la page tourner sans déployer et sans compte. Le
// point important : il appelle le VRAI `handleNearest`, donc ce qu'on regarde
// dans le navigateur est exactement le code testé, pas une imitation.

import { defineConfig, type Plugin } from "vite";
import { fileURLToPath } from "node:url";
import type { NearestCache } from "./api/nearest.js";

function apiNearest(): Plugin {
  // Un cache pour toute la session de développement, comme le cache de
  // processus d'une instance Vercel chaude.
  const cache: NearestCache = new Map();

  return {
    name: "metar-api-nearest",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !req.url.startsWith("/api/nearest")) return next();

        // `ssrLoadModule` compile le TypeScript à la volée et respecte les
        // imports sans extension (./units), comme le fait notre tsconfig.
        const chemin = fileURLToPath(new URL("./api/nearest.ts", import.meta.url));
        const mod = await server.ssrLoadModule(chemin);

        const params = new URL(req.url, "http://localhost").searchParams;
        const brut: Record<string, string> = {};
        for (const [cle, valeur] of params) brut[cle] = valeur;

        const q = mod.parseQuery(brut);
        res.setHeader("content-type", "application/json; charset=utf-8");
        if (!q.ok) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: q.error }));
          return;
        }

        const sortie = await mod.handleNearest(q.value, { cache });
        res.statusCode = sortie.status;
        res.end(JSON.stringify(sortie.body));
      });
    },
  };
}

export default defineConfig({
  // La page vit dans `public/`, à l'endroit exact où Vercel ira la chercher.
  root: "public",
  publicDir: false,
  server: { port: 5173, open: false },
  plugins: [apiNearest()],
});
