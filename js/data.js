// CANI Barber Tycoon — static game data (locations, furniture, services, upgrades)

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
  tv:           { name: 'Television',       cost: 300,  stage: 1, decor: 2, patience: 0.1, icon: '📺', desc: '+2 appeal, customers wait 10% longer.' },
  coffee:       { name: 'Coffee Machine',   cost: 400,  stage: 1, decor: 2, patience: 0.12, icon: '☕', desc: '+2 appeal, customers wait 12% longer.' },
  colorStation: { name: 'Color Station',    cost: 1000, stage: 2, station: 'color', decor: 0, icon: '🎨', desc: 'Unlocks the Hair Color service.' },
  jukebox:      { name: 'Jukebox',          cost: 800,  stage: 2, decor: 4, patience: 0.08, icon: '🎵', desc: 'Good vibes. +4 appeal.' },
  arcade:       { name: 'Arcade Machine',   cost: 1500, stage: 3, decor: 5, patience: 0.15, icon: '🕹️', desc: '+5 appeal, waiting is fun now.' },
  aquarium:     { name: 'Aquarium',         cost: 2500, stage: 3, decor: 7, icon: '🐠', desc: 'Relaxing fish. +7 appeal.' },
  goldChair:    { name: 'Gold Throne',      cost: 3000, stage: 4, station: 'chair', decor: 3, speed: 1.25, icon: '👑', desc: 'Luxury barber chair. 25% faster cuts.' },
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
  clippers:  { name: 'Pro Clippers',     icon: '✂️', desc: 'All services 15% faster per level.',      costs: [400, 1500, 5000] },
  marketing: { name: 'Social Media Ads', icon: '📱', desc: '+20% more customers per level.',          costs: [300, 1200, 4000] },
  academy:   { name: 'Barber Academy',   icon: '🎓', desc: '+0.5 skill for every barber per level.',  costs: [600, 2500, 8000] },
  loyalty:   { name: 'Loyalty Cards',    icon: '💳', desc: '+15% tips and +10% patience per level.',  costs: [250, 1000, 3500] },
};

const PRICE_LEVELS = [
  { name: 'Budget',  price: 0.8, demand: 1.3,  sat: 0.08 },
  { name: 'Normal',  price: 1.0, demand: 1.0,  sat: 0 },
  { name: 'Premium', price: 1.35, demand: 0.75, sat: -0.06 },
];

const BARBER_NAMES = ['Luka', 'Marko', 'Enzo', 'Dario', 'Ivan', 'Nika', 'Sara', 'Mia', 'Leo', 'Tino', 'Rok',
  'Jan', 'Zala', 'Maja', 'Filip', 'Ana', 'Tomas', 'Aleks', 'Bruno', 'Kai', 'Omar', 'Nina', 'Eva', 'Vito',
  'Gal', 'Tia', 'Nejc', 'Lana', 'Miha', 'Rea'];

const SKIN_TONES = ['#f5d0b5', '#e8b894', '#d49a6a', '#b07548', '#8d5a3b', '#5e3a24'];
const HAIR_COLORS = ['#1c1410', '#3b2417', '#6b4226', '#a0692f', '#d9b36c', '#7a7a7a', '#b8321f', '#e8e0d0'];
const SHIRT_COLORS = ['#457b9d', '#e76f51', '#2a9d8f', '#8d6cab', '#f4a261', '#264653', '#e9c46a', '#6c757d', '#d62828', '#3a86ff'];
const PANTS_COLORS = ['#2b2d42', '#3d405b', '#5c4d3c', '#1d3557', '#495057'];
