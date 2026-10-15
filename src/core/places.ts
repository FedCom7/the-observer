/**
 * ESPN venues come with a city but no coordinates. This table covers the
 * cities my teams and leagues play in; unknown cities simply get no map pin.
 * [longitude, latitude]
 */
const CITIES: Record<string, [number, number]> = {
  // NFL
  'Foxborough': [-71.26, 42.09], 'Orchard Park': [-78.79, 42.77], 'Buffalo': [-78.79, 42.77],
  'Miami Gardens': [-80.24, 25.96], 'East Rutherford': [-74.07, 40.81], 'Baltimore': [-76.62, 39.28],
  'Cincinnati': [-84.52, 39.1], 'Cleveland': [-81.7, 41.51], 'Pittsburgh': [-80.02, 40.45],
  'Houston': [-95.41, 29.68], 'Indianapolis': [-86.16, 39.76], 'Jacksonville': [-81.64, 30.32],
  'Nashville': [-86.77, 36.17], 'Denver': [-105.02, 39.74], 'Kansas City': [-94.48, 39.05],
  'Paradise': [-115.18, 36.09], 'Las Vegas': [-115.18, 36.09], 'Inglewood': [-118.34, 33.95],
  'Arlington': [-97.09, 32.75], 'Philadelphia': [-75.17, 39.9], 'Landover': [-76.86, 38.91],
  'Chicago': [-87.62, 41.86], 'Detroit': [-83.05, 42.34], 'Green Bay': [-88.06, 44.5],
  'Minneapolis': [-93.26, 44.97], 'Atlanta': [-84.4, 33.76], 'Charlotte': [-80.85, 35.23],
  'New Orleans': [-90.08, 29.95], 'Tampa': [-82.5, 27.98], 'Glendale': [-112.26, 33.53],
  'Santa Clara': [-121.97, 37.4], 'Seattle': [-122.33, 47.6], 'London': [-0.13, 51.51],
  'Munich': [11.62, 48.22], 'Madrid': [-3.69, 40.45], 'Mexico City': [-99.15, 19.3], 'Dublin': [-6.23, 53.34],
  'Berlin': [13.24, 52.51], 'São Paulo': [-46.72, -23.55], 'Melbourne': [144.98, -37.82],
  // College football (Texas and its usual opponents)
  'Austin': [-97.73, 30.28], 'College Station': [-96.34, 30.61], 'Columbus': [-83.02, 40.0],
  'Oxford': [-89.53, 34.36], 'Tuscaloosa': [-87.55, 33.21], 'Athens': [-83.37, 33.95],
  'Baton Rouge': [-91.18, 30.41], 'Gainesville': [-82.35, 29.65], 'Norman': [-97.44, 35.21],
  'Lexington': [-84.5, 38.02], 'Knoxville': [-83.93, 35.95], 'Fayetteville': [-94.17, 36.07],
  'Columbia': [-81.02, 33.97], 'Starkville': [-88.79, 33.46], 'Auburn': [-85.49, 32.6],
  'Dallas': [-96.8, 32.78],
  // MLB / NBA
  'New York': [-73.93, 40.83], 'Bronx': [-73.93, 40.83], 'Los Angeles': [-118.24, 34.07],
  'Boston': [-71.1, 42.35], 'San Francisco': [-122.39, 37.78], 'Toronto': [-79.39, 43.64],
  'Milwaukee': [-87.97, 43.03], 'St. Petersburg': [-82.65, 27.77], 'San Diego': [-117.16, 32.71],
  'Oklahoma City': [-97.52, 35.46], 'Brooklyn': [-73.98, 40.68], 'Washington': [-77.02, 38.87],
  'Phoenix': [-112.07, 33.45], 'Sacramento': [-121.5, 38.58], 'Portland': [-122.67, 45.53],
  'Salt Lake City': [-111.9, 40.77], 'Memphis': [-90.05, 35.14], 'San Antonio': [-98.44, 29.43],
  // Football in Italy and Europe
  'Milan': [9.12, 45.48], 'Milano': [9.12, 45.48], 'Rome': [12.45, 41.93], 'Roma': [12.45, 41.93],
  'Naples': [14.19, 40.83], 'Napoli': [14.19, 40.83], 'Turin': [7.64, 45.11], 'Torino': [7.64, 45.11],
  'Bergamo': [9.68, 45.71], 'Florence': [11.28, 43.78], 'Firenze': [11.28, 43.78], 'Bologna': [11.31, 44.49],
  'Genoa': [8.95, 44.42], 'Genova': [8.95, 44.42], 'Como': [9.07, 45.81], 'Udine': [13.2, 46.08],
  'Verona': [10.97, 45.44], 'Lecce': [18.21, 40.36], 'Cagliari': [9.13, 39.2], 'Parma': [10.34, 44.79],
  'Venice': [12.36, 45.43], 'Venezia': [12.36, 45.43], 'Sassuolo': [10.79, 44.71], 'Reggio Emilia': [10.65, 44.71],
  'Pisa': [10.4, 43.72], 'Cremona': [10.03, 45.14], 'Frosinone': [13.35, 41.63], 'Empoli': [10.95, 43.73],
  'Salzburg': [13.0, 47.82], 'Wals-Siezenheim': [13.0, 47.82], 'Paris': [2.25, 48.84], 'Barcelona': [2.12, 41.38],
  'Lisbon': [-9.16, 38.75], 'Porto': [-8.58, 41.16], 'Amsterdam': [4.94, 52.31], 'Glasgow': [-4.21, 55.85],
  'Istanbul': [28.99, 41.07], 'Seville': [-5.97, 37.38], 'Lyon': [4.98, 45.77], 'Marseille': [5.4, 43.27],
  'Dortmund': [7.45, 51.49], 'Frankfurt': [8.65, 50.07], 'Brussels': [4.33, 50.83], 'Bruges': [3.18, 51.19],
  'Belgrade': [20.46, 44.78], 'Prague': [14.47, 50.07], 'Zagreb': [16.0, 45.81],
};

export function cityLoc(city?: string): [number, number] | undefined {
  if (!city) return undefined;
  return CITIES[city] ?? CITIES[city.split(',')[0].trim()];
}
