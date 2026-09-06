// 36-cell board - EXACT match to original Business Tycoon board
// Serial numbering: START=0, then clockwise (up left side first)
// 0=START → 1=Mumbai → 2=Railways → ... → 35=Ahmedabad → back to START

function buildCells() {
  return [
    // id 0: START (bottom-left corner)
    { id:0,  name:'START',           t:'corner', sub:'start' },
    
    // LEFT COLUMN - going UP (ids 1-8)
    { id:1,  name:'Mumbai',          t:'prop',  price:9500, rent:[950,1900,3800,5700,7600,9500], g:'orange', owner:null, hc:0, hotel:0, mtg:false },
    { id:2,  name:'Railways',        t:'util',  subtype:'util', price:9000, rent:[4500], tag:'🚂', owner:null, hc:0, hotel:0, mtg:false },
    { id:3,  name:'Pune',            t:'prop',  price:7000, rent:[700,1400,2800,4200,5600,7000], g:'orange', owner:null, hc:0, hotel:0, mtg:false },
    { id:4,  name:'Jaipur',          t:'prop',  price:4000, rent:[400,800,1600,2400,3200,4000],  g:'orange', owner:null, hc:0, hotel:0, mtg:false },
    { id:5,  name:'Income Tax',      t:'tax',   amount:-1 },  // -1 means 10% or Rs.2000
    { id:6,  name:'Electric & Gas Co.', t:'util', subtype:'util', price:5500, rent:[2750], tag:'⚡', owner:null, hc:0, hotel:0, mtg:false },
    { id:7,  name:'Chance',          t:'chance' },
    { id:8,  name:'Roadways',        t:'util',  subtype:'util', price:3800, rent:[1900], tag:'🚗', owner:null, hc:0, hotel:0, mtg:false },
    
    // id 9: PRISON (top-left corner)
    { id:9,  name:'PRISON!!!!',      t:'corner', sub:'prison' },
    
    // TOP ROW - going RIGHT (ids 10-17)
    { id:10, name:'Coimbatore',      t:'prop',  price:8500, rent:[850,1700,3400,5100,6800,8500], g:'green',  owner:null, hc:0, hotel:0, mtg:false },
    { id:11, name:'Tiruppur',        t:'prop',  price:7500, rent:[750,1500,3000,4500,6000,7500], g:'green',  owner:null, hc:0, hotel:0, mtg:false },
    { id:12, name:'Waterways',       t:'util',  subtype:'util', price:6500, rent:[3250], tag:'🚢', owner:null, hc:0, hotel:0, mtg:false },
    { id:13, name:'Sankagiri R.S',   t:'prop',  price:8000, rent:[800,1600,3200,4800,6400,8000], g:'green',  owner:null, hc:0, hotel:0, mtg:false },
    { id:14, name:'Mysore',          t:'prop',  price:7500, rent:[750,1500,3000,4500,6000,7500], g:'red',    owner:null, hc:0, hotel:0, mtg:false },
    { id:15, name:'Kolkata',         t:'prop',  price:6500, rent:[650,1300,2600,3900,5200,6500], g:'red',    owner:null, hc:0, hotel:0, mtg:false },
    { id:16, name:'Community Chest', t:'comm' },
    { id:17, name:'Bangalore',       t:'prop',  price:9000, rent:[900,1800,3600,5400,7200,9000], g:'red',    owner:null, hc:0, hotel:0, mtg:false },
    
    // id 18: CLUB (top-right corner)
    { id:18, name:'CLUB',            t:'corner', sub:'club' },
    
    // RIGHT COLUMN - going DOWN (ids 19-26)
    { id:19, name:'Chennai',         t:'prop',  price:9000, rent:[900,1800,3600,5400,7200,9000], g:'lblue',  owner:null, hc:0, hotel:0, mtg:false },
    { id:20, name:'Hyderabad',       t:'prop',  price:6000, rent:[600,1200,2400,3600,4800,6000], g:'lblue',  owner:null, hc:0, hotel:0, mtg:false },
    { id:21, name:'Chance',          t:'chance' },
    { id:22, name:'Cochin',          t:'prop',  price:5000, rent:[500,1000,2000,3000,4000,5000], g:'lblue',  owner:null, hc:0, hotel:0, mtg:false },
    { id:23, name:'Ooty',            t:'prop',  price:3000, rent:[300,600,1200,1800,2400,3000],   g:'brown',  owner:null, hc:0, hotel:0, mtg:false },
    { id:24, name:'Wealth Tax',      t:'tax',   amount:1000 },
    { id:25, name:'Agra',            t:'prop',  price:3000, rent:[300,600,1200,1800,2400,3000],   g:'brown',  owner:null, hc:0, hotel:0, mtg:false },
    { id:26, name:'Shimla',          t:'prop',  price:2100, rent:[210,420,840,1260,1680,2100],    g:'brown',  owner:null, hc:0, hotel:0, mtg:false },
    
    // id 27: REST HOUSE (bottom-right corner)
    { id:27, name:'REST HOUSE',      t:'corner', sub:'rhouse' },
    
    // BOTTOM ROW - going LEFT (ids 28-35)
    { id:28, name:'Goa',             t:'prop',  price:5500, rent:[550,1100,2200,3300,4400,5500], g:'pink',   owner:null, hc:0, hotel:0, mtg:false },
    { id:29, name:'Community Chest', t:'comm' },
    { id:30, name:'New Delhi',       t:'prop',  price:8000, rent:[800,1600,3200,4800,6400,8000], g:'pink',   owner:null, hc:0, hotel:0, mtg:false },
    { id:31, name:'Lakshadweep',     t:'prop',  price:5000, rent:[500,1000,2000,3000,4000,5000], g:'pink',   owner:null, hc:0, hotel:0, mtg:false },
    { id:32, name:'Kashmir',         t:'prop',  price:3500, rent:[350,700,1400,2100,2800,3500],  g:'yellow', owner:null, hc:0, hotel:0, mtg:false },
    { id:33, name:'Darjeeling',      t:'prop',  price:3000, rent:[300,600,1200,1800,2400,3000],   g:'yellow', owner:null, hc:0, hotel:0, mtg:false },
    { id:34, name:'Airways',         t:'util',  subtype:'util', price:10500, rent:[5250], tag:'✈️', owner:null, hc:0, hotel:0, mtg:false },
    { id:35, name:'Ahmedabad',       t:'prop',  price:4400, rent:[440,880,1760,2640,3520,4400],  g:'yellow', owner:null, hc:0, hotel:0, mtg:false },
  ];
}

// Grid position: returns {col, row, orient} for CSS grid placement
function cellGridPos(id) {
  // Corners
  if (id === 0)  return { col: 1,  row: 10, orient: 'corner' };  // START bottom-left
  if (id === 9)  return { col: 1,  row: 1,  orient: 'corner' };  // PRISON top-left
  if (id === 18) return { col: 10, row: 1,  orient: 'corner' };  // CLUB top-right
  if (id === 27) return { col: 10, row: 10, orient: 'corner' };  // REST HOUSE bottom-right
  
  // Left column (ids 1-8): going UP from row 9 to row 2
  if (id >= 1 && id <= 8) return { col: 1, row: 10 - id, orient: 'left' };
  
  // Top row (ids 10-17): going RIGHT from col 2 to col 9
  if (id >= 10 && id <= 17) return { col: id - 8, row: 1, orient: 'top' };
  
  // Right column (ids 19-26): going DOWN from row 2 to row 9
  if (id >= 19 && id <= 26) return { col: 10, row: id - 17, orient: 'right' };
  
  // Bottom row (ids 28-35): going LEFT from col 9 to col 2
  if (id >= 28 && id <= 35) return { col: 37 - id, row: 10, orient: 'bottom' };
  
  return { col: 1, row: 1, orient: 'corner' };
}

const CHANCE_CARDS = [
  // EVEN = Payment (Pay money)
  { no: 2,  text:'Inflation hit! Pay Rs.200 to the bank.',                                action:'pay',     value:200 },
  { no: 4,  text:'House fire! Pay Rs.2,000 insurance.',                                   action:'pay',     value:2000 },
  { no: 6,  text:'Lost in Share Market — Pay Rs.1,500.',                                  action:'pay',     value:1500 },
  { no: 8,  text:'Drunk driving fine — Pay Rs.3,000.',                                    action:'pay',     value:3000 },
  { no: 10, text:'Charity donation — Pay Rs.1,000.',                                      action:'pay',     value:1000 },
  { no: 12, text:'Parking violation — Pay Rs.500.',                                       action:'pay',     value:500 },
  // ODD = Income (Collect money) - except #7 is Go to Prison
  { no: 3,  text:'Lottery winner! Collect Rs.2,000.',                                     action:'collect', value:2000 },
  { no: 5,  text:'Reality TV show prize! Collect Rs.3,000.',                              action:'collect', value:3000 },
  { no: 7,  text:'GO TO PRISON! Do not pass START, do not collect Rs.2,000.',             action:'jail' },
  { no: 9,  text:'Stock dividend received! Collect Rs.1,000.',                            action:'collect', value:1000 },
  { no: 11, text:'Inheritance from relative! Collect Rs.4,000.',                          action:'collect', value:4000 },
];

const COMM_CARDS = [
  // EVEN = Income (Collect money - DOUBLED)
  { no: 2,  text:'It is your birthday! Collect Rs.1,000 from EACH player.',               action:'collectAll', value:1000 },
  { no: 4,  text:'Income Tax refund! Collect Rs.4,000.',                                  action:'collect',    value:4000 },
  { no: 6,  text:'Share investment interest! Collect Rs.1,000.',                          action:'collect',    value:1000 },
  { no: 8,  text:'Sale of Stocks! Collect Rs.6,000.',                                     action:'collect',    value:6000 },
  { no: 10, text:'Game show winner! Collect Rs.5,000.',                                   action:'collect',    value:5000 },
  { no: 12, text:'Annual bonus received! Collect Rs.2,000.',                              action:'collect',    value:2000 },
  // ODD = Payment (Pay money)
  { no: 3,  text:'Insurance premium due — Pay Rs.200.',                                   action:'pay',        value:200 },
  { no: 5,  text:'Donation to charity — Pay Rs.1,000.',                                   action:'pay',        value:1000 },
  { no: 7,  text:'Consultancy fees — Pay Rs.1,500.',                                      action:'pay',        value:1500 },
  { no: 9,  text:'Home repair costs — Pay Rs.500.',                                       action:'pay',        value:500 },
  { no: 11, text:'Hospital bills — Pay Rs.2,000.',                                        action:'pay',        value:2000 },
];

function shuffleCards(cards) {
  const a = [...cards];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Group members for full-group detection
const GROUPS = {
  orange: [1, 3, 4],        // Mumbai, Pune, Jaipur
  green:  [10, 11, 13],     // Coimbatore, Tiruppur, Sankagiri R.S
  red:    [14, 15, 17],     // Mysore, Kolkata, Bangalore
  lblue:  [19, 20, 22],     // Chennai, Hyderabad, Cochin
  brown:  [23, 25, 26],     // Ooty, Agra, Shimla
  pink:   [28, 30, 31],     // Goa, New Delhi, Lakshadweep
  yellow: [32, 33, 35],     // Kashmir, Darjeeling, Ahmedabad
};

const GRP_COLOR = {
  brown:'#795548', lblue:'#29b6f6', pink:'#f06292', orange:'#ff7043',
  red:'#ef5350', yellow:'#fdd835', green:'#66bb6a', dblue:'#1565c0'
};

module.exports = { buildCells, cellGridPos, shuffleCards, CHANCE_CARDS, COMM_CARDS, GROUPS, GRP_COLOR };
