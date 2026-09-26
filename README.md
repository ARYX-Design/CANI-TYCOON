# CANI Barber Tycoon 💈

An isometric barbershop tycoon game (in the spirit of burger-shop tycoon games) that runs in the browser.
You start as **Cani**, cutting hair alone in your parents' garage, and grow the business into the **Cani Empire HQ**.

## Play

Open `index.html` in any modern browser. No build step or server needed.
You can also serve the folder, for example with `npx serve .`.

## How it works

**You run the floor with your fingers:**

- 👆 **Seat customers:** tap a waiting customer, then tap a glowing chair. Or tap a free chair to call the next person in line.
  A free barber walks over on their own.
- ✂️ **Speed up cuts:** tap a customer (or their barber) during the cut.
- 💵 **Take payment:** when a cut is done, tap the customer, then tap the register. Tap the register again to ring them up.
  Fast checkout earns a bigger tip. Customers left waiting too long leave without tipping.
- 🧹 **Sweep:** tap hair on the floor. A dirty floor makes customers unhappy.
- 🧾 **Pay bills:** rent and supplies arrive every day, electricity and water every 3 days, internet every 5 and taxes every 7.
  Late bills add a 10% fee each night and cost reputation. Unpaid electricity causes a power cut (dark shop, slower cuts, TVs off);
  unpaid water stops sinks and color stations.
- 🛎️ Later you can hire a **Receptionist**, **Cashier** and **Cleaner** (Upgrades tab) to automate these jobs.
- 🎵 Lo-fi background music (it gets richer as the shop grows) and sound effects: door bell, scissors, clippers, register,
  coins, sweeping. Toggle them with the 🎵 button or in the ⚙️ menu.

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

Each day runs from 09:00 to 19:00. Wages are paid at closing time; everything else comes as bills. The game autosaves to `localStorage`.

**Controls:** drag to pan, scroll or pinch to zoom, tap or click to place. `Space` pauses, `1`–`3` set the speed,
`B` opens Build, `Esc` cancels. Right-click also cancels the build tool.

## Code layout

| File | Purpose |
|------|---------|
| `js/data.js` | Locations, furniture, services, upgrades and balancing constants |
| `js/iso.js` | Isometric projection and drawing primitives |
| `js/sprites.js` | Procedurally drawn furniture and characters |
| `js/world.js` | Simulation: pathfinding, customers, barbers, tap actions, bills, economy, day cycle, save/load |
| `js/audio.js` | Procedural background music and sound effects (Web Audio) |
| `js/render.js` | Scene rendering (floor, walls, depth-sorted entities, overlays) |
| `js/ui.js` | HUD, panels, modals, toasts and sound effects |
| `js/main.js` | Boot, main loop and input handling |
