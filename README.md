# Copa de Reseñas · ALE Centro de Compras

Página que se actualiza sola todos los días a las 10:30 h (Argentina) con las reseñas de Google de ALE desde el 01/11/2026.

- `config.json`: objetivos, áreas, colaboradores (nombre, alias y área) y la regla de conteo.
- `scripts/actualizar.mjs`: trae las reseñas (Apify), las analiza (IA de GitHub Models, con palabras clave de respaldo) y arma `docs/index.html`.
- `data/resenas.json`: el historial.
- Secreto necesario: `APIFY_TOKEN`.

Cuenta una reseña si tiene texto y 4 o 5★. Hecho por Olpa Group.
