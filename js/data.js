// CANI Barber Tycoon — static game data (locations, furniture, services, upgrades)

// Brand: the CANI Barbershop logo, and the game's creator
const LOGO = new Image();
LOGO.src = 'img/logo-256.png';
const LOGO_WORDMARK = new Image();
LOGO_WORDMARK.src = 'img/logo-wordmark.png';
const CREATOR = { name: 'xardiig', instagram: 'https://www.instagram.com/xardiig/' };
// one-time coin bonus for following on Instagram (the server can override this list)
const SOCIAL_REWARDS = [
  { id: 'xardiig', title: 'Follow the game creator', handle: '@xardiig', url: CREATOR.instagram, coins: 50 },
];
const logoReady = img => img.complete && img.naturalWidth > 0;

const MIN_PER_SEC = 4;          // game minutes that pass per real second at 1x speed
const OPEN_TIME = 9 * 60;       // 09:00
const CLOSE_TIME = 19 * 60;     // 19:00
const START_MONEY = 400;

const STAGES = [
  {
    name: 'Garage', size: 6, maxBarbers: 1, cost: 0, rep: 0, served: 0, rent: 0,
    floor: 'concrete', wall: '#8d939c', wallDark: '#6b7079', trim: '#5a5f66',
    desc: "Your parents' old garage. One chair, a plant and big dreams.",
  },
  {
    name: 'Corner Shop', size: 8, maxBarbers: 3, cost: 1500, rep: 2.0, served: 25, rent: 40,
    floor: 'checker', wall: '#cfdce8', wallDark: '#a9b9c9', trim: '#e63946',
    desc: 'A real shop on the corner with a window to the street. Room for 3 barbers.',
  },
  {
    name: 'Downtown Barbershop', size: 10, maxBarbers: 5, cost: 6000, rep: 3.0, served: 100, rent: 120,
    floor: 'wood', wall: '#ecdcc0', wallDark: '#cdb896', trim: '#2a5c45',
    desc: 'Downtown foot traffic, wooden floors and room for 5 barbers.',
  },
  {
    name: 'Cani Studio', size: 12, maxBarbers: 8, cost: 20000, rep: 3.8, served: 300, rent: 300,
    floor: 'darkwood', wall: '#33414d', wallDark: '#26313a', trim: '#f1c453',
    desc: 'A premium studio. Celebrities start to notice. Room for 8 barbers.',
  },
  {
    name: 'Cani Empire HQ', size: 14, maxBarbers: 12, cost: 60000, rep: 4.4, served: 700, rent: 700,
    floor: 'marble', wall: '#1f1f27', wallDark: '#16161c', trim: '#f1c453',
    desc: 'The flagship of the CANI empire. Marble, gold and 12 master barbers.',
  },
];

// All furniture is 1x1 tile.
//  station: customers get serviced here by a barber
//  seat:    customers wait here
//  register: customers pay here (+tips)
//  decor:   raises shop appeal (more customers + happier customers)
//  patience: slows down how fast waiting customers get annoyed
const ITEMS = {
  barberChair:  { name: 'Barber Chair',     cost: 300,  stage: 0, station: 'chair', decor: 0, icon: '💈', desc: 'Where the magic happens. Needs a barber.' },
  waitingChair: { name: 'Waiting Chair',    cost: 60,   stage: 0, seat: true, decor: 0, icon: '🪑', desc: 'One customer can wait here.' },
  plant:        { name: 'Plant',            cost: 40,   stage: 0, decor: 1, icon: '🪴', desc: 'A bit of green. +1 appeal.' },
  barberPole:   { name: 'Barber Pole',      cost: 220,  stage: 0, decor: 2, icon: '🔴', desc: 'The classic spinning pole. +2 appeal.' },
  register:     { name: 'Cash Register',    cost: 200,  stage: 0, register: true, decor: 0, icon: '💵', desc: 'Customers pay here and tip 10% more.' },
  bench:        { name: 'Leather Bench',    cost: 180,  stage: 1, seat: true, decor: 1, icon: '🛋️', desc: 'Comfy waiting spot. +1 appeal.' },
  sink:         { name: 'Wash Sink',        cost: 450,  stage: 1, station: 'sink', decor: 0, icon: '🚿', desc: 'Unlocks Wash & Style service.' },
  tv:           { name: 'Television',       cost: 300,  stage: 1, electric: true, decor: 2, patience: 0.1, icon: '📺', desc: '+2 appeal, customers wait 10% longer.' },
  coffee:       { name: 'Coffee Machine',   cost: 400,  stage: 1, electric: true, decor: 2, patience: 0.12, icon: '☕', desc: '+2 appeal, customers wait 12% longer.' },
  colorStation: { name: 'Color Station',    cost: 1000, stage: 2, station: 'color', decor: 0, icon: '🎨', desc: 'Unlocks the Hair Color service.' },
  jukebox:      { name: 'Jukebox',          cost: 800,  stage: 2, electric: true, decor: 4, patience: 0.08, icon: '🎵', desc: 'Good vibes. +4 appeal.' },
  arcade:       { name: 'Arcade Machine',   cost: 1500, stage: 3, electric: true, decor: 5, patience: 0.15, icon: '🕹️', desc: '+5 appeal, waiting is fun now.' },
  aquarium:     { name: 'Aquarium',         cost: 2500, stage: 3, electric: true, decor: 7, icon: '🐠', desc: 'Relaxing fish. +7 appeal.' },
  goldChair:    { name: 'Gold Throne',      cost: 3000, stage: 4, station: 'chair', decor: 3, speed: 1.25, icon: '👑', desc: 'Luxury barber chair. 25% faster cuts.' },
  neonSign:     { name: 'Neon CANI Sign',   cost: 0, coinCost: 30, stage: 0, decor: 6, electric: true, icon: '💡', desc: 'Coin-only exclusive. Glowing pink neon. +6 appeal.' },
  goldenPole:   { name: 'Golden Pole',      cost: 0, coinCost: 20, stage: 0, decor: 5, icon: '✨', desc: 'Coin-only exclusive. A spinning gold barber pole. +5 appeal.' },
  statue:       { name: 'Cani Statue',      cost: 6000, stage: 4, decor: 12, icon: '🗿', desc: 'A golden statue of the founder. +12 appeal.' },
};

// time is in game minutes (at 1x, 4 game minutes pass per real second)
const SERVICES = [
  { id: 'buzz',      name: 'Buzz Cut',            price: 12,  time: 25,  station: 'chair', stage: 0, weight: 3 },
  { id: 'classic',   name: 'Classic Cut',         price: 20,  time: 40,  station: 'chair', stage: 0, weight: 4 },
  { id: 'beard',     name: 'Beard Trim',          price: 15,  time: 25,  station: 'chair', stage: 0, weight: 3 },
  { id: 'fade',      name: 'Skin Fade',           price: 32,  time: 50,  station: 'chair', stage: 1, weight: 3 },
  { id: 'wash',      name: 'Wash & Style',        price: 25,  time: 30,  station: 'sink',  stage: 1, weight: 2 },
  { id: 'shave',     name: 'Hot Towel Shave',     price: 35,  time: 45,  station: 'chair', stage: 1, weight: 2 },
  { id: 'color',     name: 'Hair Color',          price: 70,  time: 70,  station: 'color', stage: 2, weight: 2 },
  { id: 'signature', name: 'Cani Signature Cut',  price: 60,  time: 60,  station: 'chair', stage: 2, weight: 2 },
  { id: 'royal',     name: 'Royal Treatment',     price: 150, time: 90,  station: 'chair', stage: 3, weight: 1 },
  { id: 'vip',       name: 'Celebrity VIP Cut',   price: 300, time: 120, station: 'chair', stage: 4, weight: 1 },
];

const UPGRADES = {
  initiative: { name: 'Proactive Barbers', icon: '🙋', desc: 'A free barber calls the customer who has waited longest to a chair – no tapping needed.', costs: [450], stage: 0, skill: true, learned: "They'll call waiting customers themselves." },
  barberPay:  { name: 'Barbers Take Payment', icon: '💵', desc: 'When a cut is done, the barber takes the money right at the chair – no tapping needed.', costs: [600], stage: 0, skill: true, learned: "They'll take the money at the chair themselves." },
  receptionist: { name: 'Receptionist', icon: '🛎️', desc: 'Seats waiting customers for you.', costs: [1200], stage: 1, helper: true },
  cashier:   { name: 'Cashier',          icon: '🧾', desc: 'Sends finished customers to pay and rings them up.', costs: [1800], stage: 2, helper: true },
  cleaner:   { name: 'Cleaner',          icon: '🧹', desc: 'Sweeps hair off the floor.', costs: [700], stage: 1, helper: true },
  students:  { name: 'Hair School Students', icon: '🧑‍🎓', desc: 'Students sweep the floor, pay bills when they are due and help barbers cut (35% faster). +1 student per level.', costs: [500, 1600, 4000], helper: true, levels: true },
  clippers:  { name: 'Pro Clippers',     icon: '✂️', desc: 'All services 15% faster per level.',      costs: [400, 1500, 5000, 11000, 22000, 40000] },
  marketing: { name: 'Social Media Ads', icon: '📱', desc: '+20% more customers per level.',          costs: [300, 1200, 4000, 9000, 18000, 32000] },
  academy:   { name: 'Barber Academy',   icon: '🎓', desc: '+0.5 skill for every barber per level.',  costs: [600, 2500, 8000, 15000, 28000] },
  loyalty:   { name: 'Loyalty Cards',    icon: '💳', desc: '+15% tips and +10% patience per level.',  costs: [250, 1000, 3500, 8000, 16000] },
  comfort:   { name: 'Comfy Waiting Area', icon: '🛋️', desc: 'Customers wait 10% longer per level.', costs: [350, 1400, 4500, 10000] },
  prestige:  { name: 'Shop Reputation PR', icon: '📰', desc: '+8% prices per level – people pay more for a famous shop.', costs: [800, 3000, 9000, 20000, 38000] },
};

const BILL_TYPES = {
  rent:     { name: 'Rent',             icon: '🏠', note: 'Late rent upsets the landlord (−reputation)' },
  power:    { name: 'Electricity',      icon: '⚡', note: 'Overdue = power cut: dark shop, slower cuts, TVs off' },
  water:    { name: 'Water',            icon: '💧', note: 'Overdue = water off: sinks and color stations stop' },
  supplies: { name: 'Supplies',         icon: '🧴', note: 'Shampoo, blades, towels and wax' },
  internet: { name: 'Internet & Phone', icon: '📶', note: 'Keeps the booking line open' },
  tax:      { name: 'Taxes',            icon: '🏛️', note: '10% of the week\'s income' },
};

// TV commercials (made-up Slovenian ads). Each runs for a few seconds.
const TV_ADS = [
  { brand: 'KRANJSKA KLOBASA', line: 'Prava kranjska – samo pri mesarju Janezu!', icon: '🌭', bg: '#b3202a', fg: '#ffffff' },
  { brand: 'OBIŠČITE BLED', line: 'Jezero s pravljičnim otokom', icon: '🏝️', bg: '#1d6fa5', fg: '#ffffff' },
  { brand: 'BABIČINA POTICA', line: 'Orehova potica – ta teden 20 % ceneje!', icon: '🍰', bg: '#7a4a2a', fg: '#fff3dc' },
  { brand: 'RADIO GORENJC 97,3', line: 'Najboljša glasba na Gorenjskem', icon: '📻', bg: '#6a1b9a', fg: '#ffffff' },
  { brand: 'CANI BARBERSHOP', line: 'Fade, brada, britje – brez naročanja!', icon: '✂️', bg: '#0b0b0c', fg: '#c9a24f' },
  { brand: 'PLANICA', line: 'Skoki pod Poncami – pridi navijat!', icon: '🎿', bg: '#0d47a1', fg: '#ffffff' },
  { brand: 'BLEJSKA KREMŠNITA', line: 'Original od leta 1953', icon: '🍮', bg: '#f4d35e', fg: '#3b2a00' },
  { brand: 'TRIGLAV', line: 'Vsak pravi Slovenec enkrat na Triglav!', icon: '⛰️', bg: '#2e7d32', fg: '#ffffff' },
  { brand: 'MLEKO IZ BOHINJA', line: 'Sveže vsak dan, iz planine na mizo', icon: '🥛', bg: '#e3f2fd', fg: '#0d3a66' },
  { brand: 'KRANJ FEST', line: 'Koncerti v starem mestu vsak petek', icon: '🎸', bg: '#212121', fg: '#ff6f61' },
];
const currentAd = t => TV_ADS[((Math.floor(t / 6) % TV_ADS.length) + TV_ADS.length) % TV_ADS.length];

// Busy and quiet days: a weekday rhythm, plus rain and the odd festival in the old town
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const WEEKDAY_DEMAND = [0.75, 0.9, 1, 1, 1.25, 1.6, 0.6];
const FESTIVALS = ['Kranj Summer Festival', 'Old Town Market Day', 'Prešeren Day Celebrations', 'Carnival in Kranj', 'Wedding Season'];

const PRICE_LEVELS = [
  { name: 'Budget',  price: 0.8, demand: 1.3,  sat: 0.08 },
  { name: 'Normal',  price: 1.0, demand: 1.0,  sat: 0 },
  { name: 'Premium', price: 1.35, demand: 0.75, sat: -0.06 },
];

// Names: Albanian (al) and Slovenian (si), split by gender (m / f)
const NAMES = {
  al: {
    m: ['Arben', 'Besnik', 'Dritan', 'Ermal', 'Fatmir', 'Gëzim', 'Ilir', 'Klodian', 'Luan', 'Mentor', 'Petrit', 'Rinor',
      'Shpend', 'Valon', 'Agron', 'Blerim', 'Driton', 'Edon', 'Flamur', 'Genti', 'Kujtim', 'Leotrim', 'Arlind', 'Endrit',
      'Egzon', 'Alban', 'Besart', 'Florent', 'Granit', 'Jetmir', 'Lirim', 'Qendrim', 'Visar', 'Ardit'],
    f: ['Arta', 'Besa', 'Drita', 'Elira', 'Fjolla', 'Genta', 'Hana', 'Jehona', 'Kaltrina', 'Liridona', 'Mimoza', 'Rina',
      'Teuta', 'Vjosa', 'Blerta', 'Albana', 'Era', 'Dafina', 'Donika', 'Erona', 'Ilirjana', 'Lule', 'Majlinda', 'Shqipe'],
    surnames: ['Krasniqi', 'Berisha', 'Gashi', 'Hoxha', 'Shala', 'Morina', 'Kelmendi', 'Rexhepi', 'Bytyqi', 'Dervishi',
      'Hasani', 'Zeqiri', 'Leka', 'Mema', 'Kastrati', 'Dushku'],
  },
  si: {
    m: ['Janez', 'Matej', 'Luka', 'Žiga', 'Nejc', 'Rok', 'Gašper', 'Tadej', 'Anže', 'Primož', 'Blaž', 'Jure', 'Miha',
      'Tilen', 'Aljaž', 'Urban', 'Klemen', 'Domen', 'Marko', 'Jaka', 'Matevž', 'Grega', 'Bor', 'Jernej', 'Peter', 'Andraž'],
    f: ['Ana', 'Maja', 'Nika', 'Špela', 'Urška', 'Tjaša', 'Zala', 'Eva', 'Pia', 'Neža', 'Katja', 'Lara', 'Manca', 'Tina',
      'Petra', 'Sara', 'Brina', 'Mojca', 'Ajda', 'Lana', 'Metka', 'Živa', 'Hana', 'Vesna'],
    surnames: ['Novak', 'Horvat', 'Kranjc', 'Zupančič', 'Kovačič', 'Potočnik', 'Mlakar', 'Kos', 'Vidmar', 'Golob',
      'Turk', 'Kralj', 'Božič', 'Oblak', 'Dončić', 'Zajc'],
  },
};

const ORIGINS = {
  al: { flag: '🇦🇱', label: 'Albanian' },
  si: { flag: '🇸🇮', label: 'Slovenian' },
  vip: { flag: '👑', label: 'VIP' },
};

// Short things people say, in their own language
// 60% of the people in town are Slovenian, 40% Albanian
const SLOVENIAN_SHARE = 0.6;

const PHRASES = {
  al: {
    greet: ['Mirëdita!', 'Tungjatjeta!', 'Si je, mjeshtër?', 'Një fade, të lutem!'],
    happy: ['Faleminderit!', 'Shumë bukur!', 'Perfekt!', 'Super, vëlla!'],
    ok: ['Mirë.', 'Ok, faleminderit.'],
    angry: ['Shumë ngadalë!', 'Po iki!', "S'kam kohë!"],
    full: ["S'ka vend...", 'Plot është!'],
    next: ['I radhës!', 'Urdhëro!', 'Ulu këtu!'],
    chat: ['Pak më shkurt anash.', 'Si zakonisht, të lutem.', 'Sot bën vapë!'],
    barberChat: ['Mos lëviz, vëlla.', 'Do të dalë bukur!', 'Pak xhel?'],
    pay: ['Sa kushton?', 'Urdhëro paratë.', 'Me kartë, a bën?'],
  },
  si: {
    greet: ['Dober dan!', 'Živjo!', 'Kje je Cani?', 'Samo malo skrajšat!', 'Zdravo, a je prosto?', 'Lep pozdrav!', 'Dobro jutro!', 'Pa smo spet tu!'],
    happy: ['Hvala!', 'Super frizura!', 'Odlično!', 'Kot nov sem!', 'Najlepša hvala!', 'Punca bo vesela!', 'Se vidimo čez mesec!', 'Top, res fajn!'],
    ok: ['V redu.', 'Hvala, adijo.', 'Bo že.', 'Hvala, lep dan.'],
    angry: ['Prepočasi!', 'Grem drugam!', 'Nimam časa!', 'To je predolgo!', 'Pa kaj je to?!', 'Nikoli več!'],
    full: ['Polno je...', 'Ni prostora!', 'Pridem jutri.', 'Joj, gneča...'],
    next: ['Naslednji!', 'Izvolite!', 'Kar sedite!', 'Kdo je na vrsti?', 'Pridite, prosim!'],
    chat: ['Malo krajše ob straneh, prosim.', 'Kot vedno, hvala.', 'A si gledal tekmo?', 'Danes je vroče, a ne?', 'Brado samo malo porežite.', 'Kaj pravite na vreme?', 'Ne prekratko, prosim!', 'A bo Dončić spet zmagal?'],
    barberChat: ['Ne premikaj se.', 'Bo lepo, boš videl!', 'Malo gela?', 'Kako pa služba?', 'Še malo, pa sva gotova.', 'Fade kot iz kataloga!'],
    pay: ['Koliko sem dolžan?', 'Lahko s kartico?', 'Izvolite, hvala!', 'Drobiž imam, samo trenutek.'],
  },
  // xardiig, the VIP guest, mixes both languages
  vip: {
    greet: ['Živjo ekipa! 👑', 'Tungjatjeta, vëllezër!', 'Kje je moj stol?', 'xardiig je tu!'],
    chat: ['Kot vedno, brate.', 'Fade si perherë!', 'Danes snemam za Instagram!', 'Follow @xardiig 😉'],
    happy: ['Top, hvala! 👑', 'Faleminderit, mjeshtër!', 'Perfekt, kot vedno!'],
    ok: ['Hvala, se vidimo!'],
    pay: ['Izvolite, obdržite drobiž!', 'Urdhëro, pa kusur!'],
  },
};

const HAIR_STYLES_M = [0, 1, 2, 3, 4, 5];
const HAIR_STYLES_F = [10, 11, 12, 13, 14];

const SKIN_TONES = ['#f5d0b5', '#e8b894', '#d49a6a', '#b07548', '#8d5a3b', '#5e3a24'];
const HAIR_COLORS = ['#1c1410', '#3b2417', '#6b4226', '#a0692f', '#d9b36c', '#7a7a7a', '#b8321f', '#e8e0d0'];
const SHIRT_COLORS = ['#457b9d', '#e76f51', '#2a9d8f', '#8d6cab', '#f4a261', '#264653', '#e9c46a', '#6c757d', '#d62828', '#3a86ff'];
const PANTS_COLORS = ['#2b2d42', '#3d405b', '#5c4d3c', '#1d3557', '#495057', '#6b705c'];
const SHOE_COLORS = ['#2a2230', '#5a3825', '#e9ecef', '#1d1d1d', '#8d6e63'];
