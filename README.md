# CANI Barber Tycoon 💈

An isometric barbershop tycoon game (in the spirit of burger-shop tycoon games) that runs in the browser.
You start as **Cani**, cutting hair alone in your parents' garage, and grow the business into the **Cani Empire HQ**.

## Play

Open `index.html` in any modern browser. No build step or server needed.
You can also serve the folder, for example with `npx serve .`.

## How it works

- **Customers** walk in, sit on a waiting seat, then get a service from a free barber at a free station.
  If they wait too long they leave angry and your reputation ★ drops.
- **Build**: place barber chairs, waiting seats, a cash register (+tips), wash sinks, color stations and decor.
  Decor raises *appeal*, which brings more customers and makes them happier. Some decor also makes customers more patient.
- **People**: customers and barbers have Albanian 🇦🇱 and Slovenian 🇸🇮 names, and they chat in their own language
  in speech bubbles ("Mirëdita!", "Dober dan!", "Faleminderit!", "Hvala!"). Tap or click anyone to see who they are and what they're doing.
- **Staff**: hire barbers, each with their own skill, speed and daily wage. New candidates show up every morning.
  Rename any barber, Cani included, with the ✏️ button in the Staff panel or the Rename button on their card.
- **Services**: new services unlock as you grow. Some need a Wash Sink or Color Station. Pick a Budget, Normal or Premium price level.
- **Upgrades**: Pro Clippers, Social Media Ads, Barber Academy and Loyalty Cards.
- **Expand** through 5 locations. Each one needs money, reputation and a number of customers served:

| # | Location | Size | Barbers | Rent/day |
|---|----------|------|---------|----------|
| 1 | Garage | 6×6 | 1 | $0 |
| 2 | Corner Shop | 8×8 | 3 | $40 |
| 3 | Downtown Barbershop | 10×10 | 5 | $120 |
| 4 | Cani Studio | 12×12 | 8 | $300 |
| 5 | Cani Empire HQ | 14×14 | 12 | $700 |

Each day runs from 09:00 to 19:00. Wages and rent are paid at closing time. The game autosaves to `localStorage`.

**Controls:** drag to pan, scroll or pinch to zoom, tap or click to place. `Space` pauses, `1`–`3` set the speed,
`B` opens Build, `Esc` cancels. Right-click also cancels the build tool.

## Code layout

| File | Purpose |
|------|---------|
| `js/data.js` | Locations, furniture, services, upgrades and balancing constants |
| `js/iso.js` | Isometric projection and drawing primitives |
| `js/sprites.js` | Procedurally drawn furniture and characters |
| `js/world.js` | Simulation: pathfinding, customers, barbers, economy, day cycle, save/load |
| `js/render.js` | Scene rendering (floor, walls, depth-sorted entities, overlays) |
| `js/ui.js` | HUD, panels, modals, toasts and sound effects |
| `js/main.js` | Boot, main loop and input handling |
