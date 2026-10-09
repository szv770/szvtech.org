// cities.js — locations for /time.
//
// { id, name, country, region, tz (IANA), lat, lon, candleMinutes?, zip?, chabadCityId?, alt? }
//   zip           US ZIP code used for Chabad.org zmanim (via /api/zmanim?zip=)
//   chabadCityId  Chabad.org city id (via /api/zmanim?cityid=), each one confirmed against
//                 https://www.chabad.org/tools/rss/zmanim.xml?locationid=<id>&locationtype=1
//   candleMinutes local custom for candle lighting (minutes before sunset), default 18
//   alt           extra search terms
// Cities without zip/chabadCityId use the local calculation in /time/zmanim.js.

const c = (id, name, country, region, tz, lat, lon, extra) =>
  Object.freeze({ id, name, country, region, tz, lat, lon, ...(extra || {}) });

const US = 'United States', NA = 'North America', LA = 'Latin America', EU = 'Europe',
  IL = 'Israel', ME = 'Middle East & Africa', AS = 'Asia', OC = 'Oceania';
const NY = 'America/New_York', CHI = 'America/Chicago', DEN = 'America/Denver',
  LAX = 'America/Los_Angeles', JLM = 'Asia/Jerusalem';

export const CITIES = Object.freeze([
  // ---- United States: New York area ----
  c('new-york', 'New York', 'Manhattan, NY', US, NY, 40.7128, -74.0060, { zip: '10007', alt: 'nyc manhattan new york city' }),
  c('crown-heights', 'Crown Heights', 'Brooklyn, NY', US, NY, 40.6694, -73.9422, { zip: '11213', alt: 'brooklyn 770 lubavitch chabad' }),
  c('borough-park', 'Borough Park', 'Brooklyn, NY', US, NY, 40.6340, -73.9937, { zip: '11219', alt: 'brooklyn boro park' }),
  c('williamsburg', 'Williamsburg', 'Brooklyn, NY', US, NY, 40.7081, -73.9571, { zip: '11211', alt: 'brooklyn' }),
  c('flatbush', 'Flatbush', 'Brooklyn, NY', US, NY, 40.6250, -73.9610, { zip: '11230', alt: 'brooklyn midwood' }),
  c('forest-hills', 'Forest Hills', 'Queens, NY', US, NY, 40.7181, -73.8448, { zip: '11375', alt: 'queens kew gardens rego park' }),
  c('riverdale', 'Riverdale', 'Bronx, NY', US, NY, 40.8900, -73.9126, { zip: '10471', alt: 'bronx' }),
  c('five-towns', 'Five Towns', 'Long Island, NY', US, NY, 40.6226, -73.7271, { zip: '11516', alt: 'lawrence cedarhurst woodmere far rockaway inwood' }),
  c('great-neck', 'Great Neck', 'Long Island, NY', US, NY, 40.8007, -73.7285, { zip: '11021', alt: 'long island' }),
  c('monsey', 'Monsey', 'New York', US, NY, 41.1112, -74.0685, { zip: '10952', alt: 'rockland spring valley' }),
  c('lakewood', 'Lakewood', 'New Jersey', US, NY, 40.0821, -74.2097, { zip: '08701', alt: 'nj' }),
  c('teaneck', 'Teaneck', 'New Jersey', US, NY, 40.8932, -74.0116, { zip: '07666', alt: 'bergen nj englewood' }),
  c('passaic', 'Passaic', 'New Jersey', US, NY, 40.8568, -74.1285, { zip: '07055', alt: 'clifton nj' }),
  c('morristown', 'Morristown', 'New Jersey', US, NY, 40.7968, -74.4815, { zip: '07960', alt: 'nj rabbinical college' }),
  c('stamford', 'Stamford', 'Connecticut', US, NY, 41.0534, -73.5387, { zip: '06901', alt: 'ct' }),
  c('new-haven', 'New Haven', 'Connecticut', US, NY, 41.3083, -72.9279, { zip: '06511', alt: 'ct yale' }),
  // ---- United States: rest ----
  c('boston', 'Boston', 'Massachusetts', US, NY, 42.3601, -71.0589, { zip: '02446', alt: 'brookline ma' }),
  c('providence', 'Providence', 'Rhode Island', US, NY, 41.8240, -71.4128, { zip: '02906', alt: 'ri' }),
  c('philadelphia', 'Philadelphia', 'Pennsylvania', US, NY, 39.9526, -75.1652, { zip: '19103', alt: 'philly pa' }),
  c('pittsburgh', 'Pittsburgh', 'Pennsylvania', US, NY, 40.4406, -79.9959, { zip: '15217', alt: 'squirrel hill pa' }),
  c('baltimore', 'Baltimore', 'Maryland', US, NY, 39.3473, -76.6893, { zip: '21215', alt: 'pikesville md' }),
  c('silver-spring', 'Silver Spring', 'Maryland', US, NY, 38.9907, -77.0261, { zip: '20902', alt: 'md potomac' }),
  c('washington', 'Washington', 'D.C.', US, NY, 38.9072, -77.0369, { zip: '20001', alt: 'dc' }),
  c('buffalo', 'Buffalo', 'New York', US, NY, 42.8864, -78.8784, { zip: '14214' }),
  c('atlanta', 'Atlanta', 'Georgia', US, NY, 33.7490, -84.3880, { zip: '30329', alt: 'toco hills ga' }),
  c('miami', 'Miami', 'Florida', US, NY, 25.7617, -80.1918, { zip: '33139', alt: 'miami beach fl' }),
  c('aventura', 'Aventura', 'Florida', US, NY, 25.9565, -80.1392, { zip: '33180', alt: 'north miami beach fl' }),
  c('boca-raton', 'Boca Raton', 'Florida', US, NY, 26.3683, -80.1289, { zip: '33434', alt: 'boca fl' }),
  c('hollywood-fl', 'Hollywood', 'Florida', US, NY, 26.0112, -80.1495, { zip: '33021', alt: 'fl' }),
  c('orlando', 'Orlando', 'Florida', US, NY, 28.5383, -81.3792, { zip: '32801', alt: 'fl' }),
  c('cleveland', 'Cleveland', 'Ohio', US, NY, 41.4993, -81.6944, { zip: '44118', alt: 'cleveland heights beachwood oh' }),
  c('columbus', 'Columbus', 'Ohio', US, NY, 39.9612, -82.9988, { zip: '43209', alt: 'bexley oh' }),
  c('cincinnati', 'Cincinnati', 'Ohio', US, NY, 39.1031, -84.5120, { zip: '45237', alt: 'oh' }),
  c('detroit', 'Detroit', 'Michigan', US, 'America/Detroit', 42.3314, -83.0458, { zip: '48237', alt: 'oak park southfield mi' }),
  c('chicago', 'Chicago', 'Illinois', US, CHI, 41.8781, -87.6298, { zip: '60645', alt: 'west rogers park skokie il' }),
  c('milwaukee', 'Milwaukee', 'Wisconsin', US, CHI, 43.0389, -87.9065, { zip: '53202', alt: 'wi' }),
  c('minneapolis', 'Minneapolis', 'Minnesota', US, CHI, 44.9778, -93.2650, { zip: '55416', alt: 'st louis park mn' }),
  c('st-louis', 'St. Louis', 'Missouri', US, CHI, 38.6270, -90.1994, { zip: '63130', alt: 'saint louis mo' }),
  c('kansas-city', 'Kansas City', 'Missouri', US, CHI, 39.0997, -94.5786, { zip: '64113', alt: 'mo' }),
  c('nashville', 'Nashville', 'Tennessee', US, CHI, 36.1627, -86.7816, { zip: '37205', alt: 'tn' }),
  c('new-orleans', 'New Orleans', 'Louisiana', US, CHI, 29.9511, -90.0715, { zip: '70115', alt: 'la nola' }),
  c('dallas', 'Dallas', 'Texas', US, CHI, 32.7767, -96.7970, { zip: '75230', alt: 'tx' }),
  c('houston', 'Houston', 'Texas', US, CHI, 29.7604, -95.3698, { zip: '77096', alt: 'tx' }),
  c('austin', 'Austin', 'Texas', US, CHI, 30.2672, -97.7431, { zip: '78701', alt: 'tx' }),
  c('denver', 'Denver', 'Colorado', US, DEN, 39.7392, -104.9903, { zip: '80224', alt: 'co' }),
  c('phoenix', 'Phoenix', 'Arizona', US, 'America/Phoenix', 33.4484, -112.0740, { zip: '85018', alt: 'scottsdale az' }),
  c('las-vegas', 'Las Vegas', 'Nevada', US, LAX, 36.1699, -115.1398, { zip: '89117', alt: 'nv' }),
  c('los-angeles', 'Los Angeles', 'California', US, LAX, 34.0522, -118.2437, { zip: '90036', alt: 'la fairfax pico robertson ca' }),
  c('san-diego', 'San Diego', 'California', US, LAX, 32.7157, -117.1611, { zip: '92122', alt: 'la jolla ca' }),
  c('san-francisco', 'San Francisco', 'California', US, LAX, 37.7749, -122.4194, { zip: '94118', alt: 'sf bay area ca' }),
  c('seattle', 'Seattle', 'Washington', US, LAX, 47.6062, -122.3321, { zip: '98118', alt: 'wa' }),
  c('portland', 'Portland', 'Oregon', US, LAX, 45.5152, -122.6784, { zip: '97201', alt: 'or' }),
  c('anchorage', 'Anchorage', 'Alaska', US, 'America/Anchorage', 61.2181, -149.9003, { zip: '99501', alt: 'ak' }),
  c('honolulu', 'Honolulu', 'Hawaii', US, 'Pacific/Honolulu', 21.3069, -157.8583, { zip: '96813', alt: 'hi' }),

  // ---- Canada ----
  c('toronto', 'Toronto', 'Canada', NA, 'America/Toronto', 43.6532, -79.3832, { chabadCityId: 540, alt: 'thornhill ontario' }),
  c('montreal', 'Montreal', 'Canada', NA, 'America/Toronto', 45.5017, -73.5673, { chabadCityId: 345, alt: 'montréal quebec' }),
  c('ottawa', 'Ottawa', 'Canada', NA, 'America/Toronto', 45.4215, -75.6972, { chabadCityId: 387, alt: 'ontario' }),
  c('winnipeg', 'Winnipeg', 'Canada', NA, 'America/Winnipeg', 49.8951, -97.1384, { chabadCityId: 587, alt: 'manitoba' }),
  c('calgary', 'Calgary', 'Canada', NA, 'America/Edmonton', 51.0447, -114.0719, { chabadCityId: 97, alt: 'alberta' }),
  c('vancouver', 'Vancouver', 'Canada', NA, 'America/Vancouver', 49.2827, -123.1207, { chabadCityId: 557, alt: 'british columbia bc' }),
  c('halifax', 'Halifax', 'Canada', NA, 'America/Halifax', 44.6488, -63.5752, { chabadCityId: 206, alt: 'nova scotia' }),

  // ---- Latin America ----
  c('mexico-city', 'Mexico City', 'Mexico', LA, 'America/Mexico_City', 19.4326, -99.1332, { chabadCityId: 330, alt: 'cdmx polanco' }),
  c('cancun', 'Cancún', 'Mexico', LA, 'America/Cancun', 21.1619, -86.8515),
  c('panama-city', 'Panama City', 'Panama', LA, 'America/Panama', 8.9824, -79.5199, { chabadCityId: 392 }),
  c('san-jose-cr', 'San José', 'Costa Rica', LA, 'America/Costa_Rica', 9.9281, -84.0907, { chabadCityId: 621 }),
  c('bogota', 'Bogotá', 'Colombia', LA, 'America/Bogota', 4.7110, -74.0721),
  c('caracas', 'Caracas', 'Venezuela', LA, 'America/Caracas', 10.4806, -66.9036, { chabadCityId: 105 }),
  c('lima', 'Lima', 'Peru', LA, 'America/Lima', -12.0464, -77.0428, { chabadCityId: 295 }),
  c('santiago', 'Santiago', 'Chile', LA, 'America/Santiago', -33.4489, -70.6693, { chabadCityId: 482 }),
  c('buenos-aires', 'Buenos Aires', 'Argentina', LA, 'America/Argentina/Buenos_Aires', -34.6037, -58.3816, { chabadCityId: 90 }),
  c('montevideo', 'Montevideo', 'Uruguay', LA, 'America/Montevideo', -34.9011, -56.1645, { chabadCityId: 342 }),
  c('sao-paulo', 'São Paulo', 'Brazil', LA, 'America/Sao_Paulo', -23.5505, -46.6333),
  c('rio-de-janeiro', 'Rio de Janeiro', 'Brazil', LA, 'America/Sao_Paulo', -22.9068, -43.1729, { chabadCityId: 442 }),

  // ---- Europe ----
  c('london', 'London', 'United Kingdom', EU, 'Europe/London', 51.5074, -0.1278, { chabadCityId: 300, alt: 'england uk' }),
  c('stamford-hill', 'Stamford Hill', 'London, UK', EU, 'Europe/London', 51.5700, -0.0727, { alt: 'london england uk n16' }),
  c('golders-green', 'Golders Green', 'London, UK', EU, 'Europe/London', 51.5724, -0.1940, { alt: 'london england uk hendon' }),
  c('manchester', 'Manchester', 'United Kingdom', EU, 'Europe/London', 53.4808, -2.2426, { chabadCityId: 316, alt: 'england uk salford' }),
  c('gateshead', 'Gateshead', 'United Kingdom', EU, 'Europe/London', 54.9527, -1.6034, { chabadCityId: 2856, alt: 'england uk newcastle' }),
  c('glasgow', 'Glasgow', 'United Kingdom', EU, 'Europe/London', 55.8642, -4.2518, { chabadCityId: 193, alt: 'scotland uk' }),
  c('dublin', 'Dublin', 'Ireland', EU, 'Europe/Dublin', 53.3498, -6.2603, { chabadCityId: 154 }),
  c('paris', 'Paris', 'France', EU, 'Europe/Paris', 48.8566, 2.3522, { chabadCityId: 394 }),
  c('marseille', 'Marseille', 'France', EU, 'Europe/Paris', 43.2965, 5.3698, { chabadCityId: 322 }),
  c('lyon', 'Lyon', 'France', EU, 'Europe/Paris', 45.7640, 4.8357, { chabadCityId: 310 }),
  c('nice', 'Nice', 'France', EU, 'Europe/Paris', 43.7102, 7.2620, { chabadCityId: 677 }),
  c('strasbourg', 'Strasbourg', 'France', EU, 'Europe/Paris', 48.5734, 7.7521, { chabadCityId: 759 }),
  c('antwerp', 'Antwerp', 'Belgium', EU, 'Europe/Brussels', 51.2194, 4.4025, { chabadCityId: 24, alt: 'antwerpen' }),
  c('brussels', 'Brussels', 'Belgium', EU, 'Europe/Brussels', 50.8503, 4.3517, { chabadCityId: 86, alt: 'bruxelles' }),
  c('amsterdam', 'Amsterdam', 'Netherlands', EU, 'Europe/Amsterdam', 52.3676, 4.9041, { chabadCityId: 19, alt: 'holland' }),
  c('zurich', 'Zurich', 'Switzerland', EU, 'Europe/Zurich', 47.3769, 8.5417, { chabadCityId: 611, alt: 'zürich' }),
  c('geneva', 'Geneva', 'Switzerland', EU, 'Europe/Zurich', 46.2044, 6.1432, { chabadCityId: 190, alt: 'genève' }),
  c('berlin', 'Berlin', 'Germany', EU, 'Europe/Berlin', 52.5200, 13.4050, { chabadCityId: 56 }),
  c('frankfurt', 'Frankfurt', 'Germany', EU, 'Europe/Berlin', 50.1109, 8.6821, { chabadCityId: 182 }),
  c('munich', 'Munich', 'Germany', EU, 'Europe/Berlin', 48.1351, 11.5820, { chabadCityId: 349, alt: 'münchen' }),
  c('hamburg', 'Hamburg', 'Germany', EU, 'Europe/Berlin', 53.5511, 9.9937, { chabadCityId: 207 }),
  c('vienna', 'Vienna', 'Austria', EU, 'Europe/Vienna', 48.2082, 16.3738, { chabadCityId: 565, alt: 'wien' }),
  c('prague', 'Prague', 'Czech Republic', EU, 'Europe/Prague', 50.0755, 14.4378, { chabadCityId: 421, alt: 'praha czechia' }),
  c('budapest', 'Budapest', 'Hungary', EU, 'Europe/Budapest', 47.4979, 19.0402, { chabadCityId: 88 }),
  c('warsaw', 'Warsaw', 'Poland', EU, 'Europe/Warsaw', 52.2297, 21.0122, { chabadCityId: 570, alt: 'warszawa' }),
  c('krakow', 'Kraków', 'Poland', EU, 'Europe/Warsaw', 50.0647, 19.9450, { alt: 'cracow' }),
  c('copenhagen', 'Copenhagen', 'Denmark', EU, 'Europe/Copenhagen', 55.6761, 12.5683, { chabadCityId: 134 }),
  c('stockholm', 'Stockholm', 'Sweden', EU, 'Europe/Stockholm', 59.3293, 18.0686, { chabadCityId: 514 }),
  c('oslo', 'Oslo', 'Norway', EU, 'Europe/Oslo', 59.9139, 10.7522, { chabadCityId: 386 }),
  c('helsinki', 'Helsinki', 'Finland', EU, 'Europe/Helsinki', 60.1699, 24.9384, { chabadCityId: 219 }),
  c('reykjavik', 'Reykjavík', 'Iceland', EU, 'Atlantic/Reykjavik', 64.1466, -21.9426, { chabadCityId: 439 }),
  c('rome', 'Rome', 'Italy', EU, 'Europe/Rome', 41.9028, 12.4964, { chabadCityId: 449, alt: 'roma' }),
  c('milan', 'Milan', 'Italy', EU, 'Europe/Rome', 45.4642, 9.1900, { chabadCityId: 332, alt: 'milano' }),
  c('venice', 'Venice', 'Italy', EU, 'Europe/Rome', 45.4408, 12.3155, { chabadCityId: 561, alt: 'venezia' }),
  c('madrid', 'Madrid', 'Spain', EU, 'Europe/Madrid', 40.4168, -3.7038, { chabadCityId: 314 }),
  c('barcelona', 'Barcelona', 'Spain', EU, 'Europe/Madrid', 41.3851, 2.1734, { chabadCityId: 44 }),
  c('lisbon', 'Lisbon', 'Portugal', EU, 'Europe/Lisbon', 38.7223, -9.1393, { chabadCityId: 297, alt: 'lisboa' }),
  c('athens', 'Athens', 'Greece', EU, 'Europe/Athens', 37.9838, 23.7275, { chabadCityId: 29 }),
  c('limassol', 'Limassol', 'Cyprus', EU, 'Asia/Nicosia', 34.7071, 33.0226, { chabadCityId: 779 }),
  c('istanbul', 'Istanbul', 'Turkey', EU, 'Europe/Istanbul', 41.0082, 28.9784, { chabadCityId: 614 }),
  c('bucharest', 'Bucharest', 'Romania', EU, 'Europe/Bucharest', 44.4268, 26.1025, { chabadCityId: 87 }),
  c('riga', 'Riga', 'Latvia', EU, 'Europe/Riga', 56.9496, 24.1052, { chabadCityId: 632 }),
  c('vilnius', 'Vilnius', 'Lithuania', EU, 'Europe/Vilnius', 54.6872, 25.2797, { chabadCityId: 623, alt: 'vilna' }),
  c('minsk', 'Minsk', 'Belarus', EU, 'Europe/Minsk', 53.9006, 27.5590, { chabadCityId: 336 }),
  c('moscow', 'Moscow', 'Russia', EU, 'Europe/Moscow', 55.7558, 37.6173, { chabadCityId: 347, alt: 'moskva' }),
  c('st-petersburg', 'St. Petersburg', 'Russia', EU, 'Europe/Moscow', 59.9311, 30.3609, { chabadCityId: 462, alt: 'saint petersburg leningrad' }),
  c('kyiv', 'Kyiv', 'Ukraine', EU, 'Europe/Kiev', 50.4501, 30.5234, { chabadCityId: 263, alt: 'kiev' }),
  c('dnipro', 'Dnipro', 'Ukraine', EU, 'Europe/Kiev', 48.4647, 35.0462, { chabadCityId: 934, alt: 'dnepropetrovsk dnepr yekaterinoslav' }),
  c('odesa', 'Odesa', 'Ukraine', EU, 'Europe/Kiev', 46.4825, 30.7233, { chabadCityId: 378, alt: 'odessa' }),
  c('kharkiv', 'Kharkiv', 'Ukraine', EU, 'Europe/Kiev', 49.9935, 36.2304, { chabadCityId: 930, alt: 'kharkov' }),
  c('uman', 'Uman', 'Ukraine', EU, 'Europe/Kiev', 48.7484, 30.2219, { chabadCityId: 801 }),
  c('tbilisi', 'Tbilisi', 'Georgia', EU, 'Asia/Tbilisi', 41.7151, 44.8271, { chabadCityId: 770 }),

  // ---- Israel ----
  c('jerusalem', 'Jerusalem', 'Israel', IL, JLM, 31.7683, 35.2137, { candleMinutes: 40, chabadCityId: 247, alt: 'yerushalayim' }),
  c('tel-aviv', 'Tel Aviv', 'Israel', IL, JLM, 32.0853, 34.7818, { chabadCityId: 531, alt: 'yafo jaffa' }),
  c('bnei-brak', 'Bnei Brak', 'Israel', IL, JLM, 32.0807, 34.8338, { chabadCityId: 701, alt: 'bene beraq' }),
  c('haifa', 'Haifa', 'Israel', IL, JLM, 32.7940, 34.9896, { candleMinutes: 30, chabadCityId: 689 }),
  c('tzfat', 'Tzfat', 'Israel', IL, JLM, 32.9646, 35.4960, { alt: 'safed tsfat zfat' }),
  c('kfar-chabad', 'Kfar Chabad', 'Israel', IL, JLM, 31.9886, 34.8519, { chabadCityId: 704 }),
  c('beit-shemesh', 'Beit Shemesh', 'Israel', IL, JLM, 31.7470, 34.9881, { chabadCityId: 756, alt: 'bet shemesh' }),
  c('beitar-illit', 'Beitar Illit', 'Israel', IL, JLM, 31.6969, 35.1153, { chabadCityId: 982, alt: 'betar' }),
  c('efrat', 'Efrat', 'Israel', IL, JLM, 31.6537, 35.1503, { chabadCityId: 826, alt: 'gush etzion' }),
  c('modiin', "Modi'in", 'Israel', IL, JLM, 31.8980, 35.0104, { alt: 'modiin' }),
  c('petah-tikva', 'Petah Tikva', 'Israel', IL, JLM, 32.0840, 34.8878, { chabadCityId: 852, alt: 'petach tikvah' }),
  c('rishon-lezion', 'Rishon LeZion', 'Israel', IL, JLM, 31.9730, 34.7925, { chabadCityId: 853 }),
  c('herzliya', 'Herzliya', 'Israel', IL, JLM, 32.1624, 34.8447, { chabadCityId: 981 }),
  c('raanana', "Ra'anana", 'Israel', IL, JLM, 32.1848, 34.8713, { alt: 'raanana' }),
  c('netanya', 'Netanya', 'Israel', IL, JLM, 32.3215, 34.8532, { chabadCityId: 694 }),
  c('ashdod', 'Ashdod', 'Israel', IL, JLM, 31.8044, 34.6553, { chabadCityId: 699 }),
  c('beer-sheva', "Be'er Sheva", 'Israel', IL, JLM, 31.2520, 34.7915, { alt: 'beersheba beer sheva' }),
  c('tiberias', 'Tiberias', 'Israel', IL, JLM, 32.7959, 35.5310, { chabadCityId: 697, alt: 'tveria teverya' }),
  c('hebron', 'Hebron', 'Israel', IL, JLM, 31.5326, 35.0998, { chabadCityId: 690, alt: 'chevron kiryat arba' }),
  c('eilat', 'Eilat', 'Israel', IL, JLM, 29.5577, 34.9519, { chabadCityId: 687 }),

  // ---- Middle East & Africa ----
  c('dubai', 'Dubai', 'United Arab Emirates', ME, 'Asia/Dubai', 25.2048, 55.2708, { chabadCityId: 874, alt: 'uae' }),
  c('riyadh', 'Riyadh', 'Saudi Arabia', ME, 'Asia/Riyadh', 24.7136, 46.6753, { chabadCityId: 443 }),
  c('tehran', 'Tehran', 'Iran', ME, 'Asia/Tehran', 35.6892, 51.3890, { chabadCityId: 530 }),
  c('baku', 'Baku', 'Azerbaijan', ME, 'Asia/Baku', 40.4093, 49.8671, { chabadCityId: 742 }),
  c('cairo', 'Cairo', 'Egypt', ME, 'Africa/Cairo', 30.0444, 31.2357, { chabadCityId: 95 }),
  c('casablanca', 'Casablanca', 'Morocco', ME, 'Africa/Casablanca', 33.5731, -7.5898, { chabadCityId: 109 }),
  c('addis-ababa', 'Addis Ababa', 'Ethiopia', ME, 'Africa/Addis_Ababa', 9.0054, 38.7636, { chabadCityId: 653 }),
  c('nairobi', 'Nairobi', 'Kenya', ME, 'Africa/Nairobi', -1.2921, 36.8219, { chabadCityId: 354 }),
  c('lagos', 'Lagos', 'Nigeria', ME, 'Africa/Lagos', 6.5244, 3.3792, { chabadCityId: 648 }),
  c('johannesburg', 'Johannesburg', 'South Africa', ME, 'Africa/Johannesburg', -26.2041, 28.0473, { chabadCityId: 248, alt: 'joburg' }),
  c('cape-town', 'Cape Town', 'South Africa', ME, 'Africa/Johannesburg', -33.9249, 18.4241, { chabadCityId: 104 }),

  // ---- Asia ----
  c('tashkent', 'Tashkent', 'Uzbekistan', AS, 'Asia/Tashkent', 41.2995, 69.2401, { chabadCityId: 681 }),
  c('almaty', 'Almaty', 'Kazakhstan', AS, 'Asia/Almaty', 43.2220, 76.8512, { chabadCityId: 752 }),
  c('mumbai', 'Mumbai', 'India', AS, 'Asia/Kolkata', 19.0760, 72.8777, { chabadCityId: 68, alt: 'bombay' }),
  c('new-delhi', 'New Delhi', 'India', AS, 'Asia/Kolkata', 28.6139, 77.2090, { chabadCityId: 366, alt: 'delhi' }),
  c('goa', 'Goa', 'India', AS, 'Asia/Kolkata', 15.5937, 73.7380, { alt: 'anjuna arambol' }),
  c('kathmandu', 'Kathmandu', 'Nepal', AS, 'Asia/Kathmandu', 27.7172, 85.3240, { chabadCityId: 259 }),
  c('bangkok', 'Bangkok', 'Thailand', AS, 'Asia/Bangkok', 13.7563, 100.5018, { chabadCityId: 42 }),
  c('chiang-mai', 'Chiang Mai', 'Thailand', AS, 'Asia/Bangkok', 18.7883, 98.9853, { chabadCityId: 684 }),
  c('ho-chi-minh', 'Ho Chi Minh City', 'Vietnam', AS, 'Asia/Ho_Chi_Minh', 10.8231, 106.6297, { chabadCityId: 223, alt: 'saigon' }),
  c('kuala-lumpur', 'Kuala Lumpur', 'Malaysia', AS, 'Asia/Kuala_Lumpur', 3.1390, 101.6869, { chabadCityId: 275 }),
  c('singapore', 'Singapore', 'Singapore', AS, 'Asia/Singapore', 1.3521, 103.8198, { chabadCityId: 499 }),
  c('manila', 'Manila', 'Philippines', AS, 'Asia/Manila', 14.5995, 120.9842, { chabadCityId: 320 }),
  c('hong-kong', 'Hong Kong', 'China', AS, 'Asia/Hong_Kong', 22.3193, 114.1694, { chabadCityId: 226 }),
  c('shanghai', 'Shanghai', 'China', AS, 'Asia/Shanghai', 31.2304, 121.4737, { chabadCityId: 493 }),
  c('beijing', 'Beijing', 'China', AS, 'Asia/Shanghai', 39.9042, 116.4074, { chabadCityId: 397, alt: 'peking' }),
  c('taipei', 'Taipei', 'Taiwan', AS, 'Asia/Taipei', 25.0330, 121.5654, { chabadCityId: 888 }),
  c('seoul', 'Seoul', 'South Korea', AS, 'Asia/Seoul', 37.5665, 126.9780, { chabadCityId: 491, alt: 'korea' }),
  c('tokyo', 'Tokyo', 'Japan', AS, 'Asia/Tokyo', 35.6762, 139.6503, { chabadCityId: 537 }),

  // ---- Oceania ----
  c('sydney', 'Sydney', 'Australia', OC, 'Australia/Sydney', -33.8688, 151.2093, { chabadCityId: 523, alt: 'bondi nsw' }),
  c('melbourne', 'Melbourne', 'Australia', OC, 'Australia/Melbourne', -37.8136, 144.9631, { chabadCityId: 327, alt: 'st kilda caulfield victoria' }),
  c('brisbane', 'Brisbane', 'Australia', OC, 'Australia/Brisbane', -27.4698, 153.0251, { chabadCityId: 80, alt: 'queensland' }),
  c('adelaide', 'Adelaide', 'Australia', OC, 'Australia/Adelaide', -34.9285, 138.6007, { chabadCityId: 5 }),
  c('perth', 'Perth', 'Australia', OC, 'Australia/Perth', -31.9505, 115.8605, { chabadCityId: 401 }),
  c('auckland', 'Auckland', 'New Zealand', OC, 'Pacific/Auckland', -36.8485, 174.7633, { chabadCityId: 32 }),
]);

export const DEFAULT_CITY_ID = 'new-york';
export const REGIONS = [US, NA, LA, EU, IL, ME, AS, OC];
export const cityById = (id) => CITIES.find((x) => x.id === id) || null;

// ---------- US ZIP → time zone (best effort, by 3-digit prefix) ----------
// Ranges are [from, to, tz] over the first three digits. Split states are handled
// at the prefix level (FL panhandle, TN, KY, IN, ND/SD/NE, west TX, ID, OR).
const ET = NY, CT = CHI, MT = DEN, PT = LAX;
const ZIP_TZ = [
  [5, 5, ET], [6, 9, 'America/Puerto_Rico'], [10, 69, ET], [70, 89, ET], [100, 149, ET],
  [150, 199, ET], [200, 219, ET], [220, 268, ET], [270, 299, ET], [300, 319, ET],
  [320, 323, ET], [324, 325, CT], [326, 349, ET], [350, 369, CT],
  [370, 372, CT], [373, 374, ET], [375, 375, CT], [376, 379, ET], [380, 385, CT],
  [386, 397, CT], [398, 399, ET],
  [400, 419, ET], [420, 424, CT], [425, 427, ET],
  [430, 459, ET],
  [460, 462, 'America/Indiana/Indianapolis'], [463, 464, CT], [465, 475, 'America/Indiana/Indianapolis'],
  [476, 477, CT], [478, 479, 'America/Indiana/Indianapolis'],
  [480, 497, 'America/Detroit'], [498, 499, CT],
  [500, 528, CT], [530, 549, CT], [550, 567, CT],
  [570, 574, CT], [575, 577, MT], [580, 585, CT], [586, 588, MT],
  [590, 599, MT], [600, 629, CT], [630, 658, CT], [660, 679, CT],
  [680, 692, CT], [693, 693, MT],
  [700, 714, CT], [716, 729, CT], [730, 749, CT], [750, 797, CT], [798, 799, MT],
  [800, 816, MT], [820, 831, MT], [832, 834, 'America/Boise'], [835, 835, PT],
  [836, 837, 'America/Boise'], [838, 838, PT], [840, 847, MT],
  [850, 865, 'America/Phoenix'], [870, 884, MT], [885, 885, MT],
  [889, 898, PT], [900, 961, PT], [967, 968, 'Pacific/Honolulu'], [969, 969, 'Pacific/Guam'],
  [970, 978, PT], [979, 979, 'America/Boise'], [980, 994, PT], [995, 999, 'America/Anchorage'],
];

/** Best-effort IANA zone for a 5-digit US ZIP, or null when the prefix is unknown. */
export function zipToTz(zip) {
  if (!/^\d{5}$/.test(String(zip))) return null;
  const p = parseInt(String(zip).slice(0, 3), 10);
  for (const [a, b, tz] of ZIP_TZ) if (p >= a && p <= b) return tz;
  return null;
}

/** Time zones offered for a ZIP override. */
export const US_ZONES = [
  ['America/New_York', 'Eastern'],
  ['America/Chicago', 'Central'],
  ['America/Denver', 'Mountain'],
  ['America/Phoenix', 'Arizona'],
  ['America/Los_Angeles', 'Pacific'],
  ['America/Anchorage', 'Alaska'],
  ['Pacific/Honolulu', 'Hawaii'],
  ['America/Puerto_Rico', 'Atlantic'],
];
