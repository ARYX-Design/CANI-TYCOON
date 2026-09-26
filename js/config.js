// Where the rewards server lives.
//   ''   : same site as the game (when the game is served by server/server.js) — the usual setup
//   URL  : a separate API host, e.g. 'https://api.cani-barber.com' (set ALLOWED_ORIGIN on the server too)
//   null : no server; coins can't be exchanged for real coupons
const CANI_CONFIG = {
  apiBase: '',
};
