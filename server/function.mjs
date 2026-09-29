// The rewards API as a Neon Function (deployed by .github/workflows/deploy.yml).
// Neon injects DATABASE_URL; the other settings (STAFF_PIN, ALLOWED_ORIGIN, TZ, …) are Function env vars.
// Its public URL has no /api prefix: https://…neon.tech/me, /leaderboard, … (both forms work).
import dataModule from './data.js';
import apiModule from './api.js';

const data = dataModule.openData({ databaseUrl: process.env.DATABASE_URL });
const handle = apiModule.createApi(data);

export default {
  fetch(request) {
    return handle(request);
  },
};
