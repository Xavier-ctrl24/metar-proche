// vitest.config.ts
// Existe pour UNE raison : vite.config.ts déplace la racine dans `public/`
// pour le serveur de développement, et vitest lit vite.config.ts par défaut.
// Sans ce fichier, la suite de tests irait chercher les tests sous `public/`
// et n'en trouverait aucun. Vitest donne la priorité à vitest.config.ts, ce
// qui remet la racine au bon endroit sans toucher au serveur de dev.

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    root: ".",
    include: ["tests/**/*.test.ts"],
  },
});
