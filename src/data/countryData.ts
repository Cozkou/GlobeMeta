export interface CountryMusicData {
  name: string;
  flag: string;
  vibe: string;
  vibeColor: string;
  tracks: { name: string; artist: string; dotColor: string }[];
  mood: { energy: number; danceability: number; valence: number };
}

const dotColors = [
  'hsl(330, 80%, 60%)',
  'hsl(200, 80%, 55%)',
  'hsl(40, 90%, 55%)',
  'hsl(160, 70%, 45%)',
  'hsl(265, 80%, 60%)',
];

export const countryMusicMap: Record<string, CountryMusicData> = {
  Brazil: {
    name: 'Brazil',
    flag: '🇧🇷',
    vibe: 'Party',
    vibeColor: 'hsl(40, 90%, 55%)',
    tracks: [
      { name: 'Vai Malandra', artist: 'Anitta', dotColor: dotColors[0] },
      { name: 'Envolver', artist: 'Anitta', dotColor: dotColors[1] },
      { name: 'Ela Baila Sozinha', artist: 'Natiruts', dotColor: dotColors[2] },
      { name: 'Só Quer Vrau', artist: 'MC MM', dotColor: dotColors[3] },
      { name: 'Aquarela', artist: 'Toquinho', dotColor: dotColors[4] },
    ],
    mood: { energy: 82, danceability: 91, valence: 78 },
  },
  Japan: {
    name: 'Japan',
    flag: '🇯🇵',
    vibe: 'Melancholic',
    vibeColor: 'hsl(200, 80%, 55%)',
    tracks: [
      { name: 'Plastic Love', artist: 'Mariya Takeuchi', dotColor: dotColors[0] },
      { name: 'Stay With Me', artist: 'Miki Matsubara', dotColor: dotColors[1] },
      { name: 'Sparkle', artist: 'RADWIMPS', dotColor: dotColors[2] },
      { name: 'Pretender', artist: 'Official HIGE DANdism', dotColor: dotColors[3] },
      { name: 'Lemon', artist: 'Kenshi Yonezu', dotColor: dotColors[4] },
    ],
    mood: { energy: 45, danceability: 52, valence: 35 },
  },
  'United States of America': {
    name: 'United States',
    flag: '🇺🇸',
    vibe: 'High Energy',
    vibeColor: 'hsl(15, 90%, 55%)',
    tracks: [
      { name: 'Blinding Lights', artist: 'The Weeknd', dotColor: dotColors[0] },
      { name: 'Levitating', artist: 'Dua Lipa', dotColor: dotColors[1] },
      { name: 'As It Was', artist: 'Harry Styles', dotColor: dotColors[2] },
      { name: 'Anti-Hero', artist: 'Taylor Swift', dotColor: dotColors[3] },
      { name: 'Flowers', artist: 'Miley Cyrus', dotColor: dotColors[4] },
    ],
    mood: { energy: 88, danceability: 76, valence: 65 },
  },
  Nigeria: {
    name: 'Nigeria',
    flag: '🇳🇬',
    vibe: 'Afrobeats',
    vibeColor: 'hsl(160, 70%, 45%)',
    tracks: [
      { name: 'Essence', artist: 'Wizkid ft. Tems', dotColor: dotColors[0] },
      { name: 'Last Last', artist: 'Burna Boy', dotColor: dotColors[1] },
      { name: 'Love Nwantiti', artist: 'CKay', dotColor: dotColors[2] },
      { name: 'Calm Down', artist: 'Rema', dotColor: dotColors[3] },
      { name: 'Peru', artist: 'Fireboy DML', dotColor: dotColors[4] },
    ],
    mood: { energy: 75, danceability: 88, valence: 82 },
  },
  France: {
    name: 'France',
    flag: '🇫🇷',
    vibe: 'Dreamy',
    vibeColor: 'hsl(265, 80%, 60%)',
    tracks: [
      { name: 'Nightcall', artist: 'Kavinsky', dotColor: dotColors[0] },
      { name: 'Somethin About Us', artist: 'Daft Punk', dotColor: dotColors[1] },
      { name: 'La Vie en Rose', artist: 'Édith Piaf', dotColor: dotColors[2] },
      { name: 'Alors on Danse', artist: 'Stromae', dotColor: dotColors[3] },
      { name: 'Midnight City', artist: 'M83', dotColor: dotColors[4] },
    ],
    mood: { energy: 58, danceability: 64, valence: 55 },
  },
  India: {
    name: 'India',
    flag: '🇮🇳',
    vibe: 'Euphoric',
    vibeColor: 'hsl(330, 80%, 60%)',
    tracks: [
      { name: 'Chaiyya Chaiyya', artist: 'A.R. Rahman', dotColor: dotColors[0] },
      { name: 'Jai Ho', artist: 'A.R. Rahman', dotColor: dotColors[1] },
      { name: 'Mundian To Bach Ke', artist: 'Panjabi MC', dotColor: dotColors[2] },
      { name: 'Apna Time Aayega', artist: 'Ranveer Singh', dotColor: dotColors[3] },
      { name: 'Pasoori', artist: 'Ali Sethi & Shae Gill', dotColor: dotColors[4] },
    ],
    mood: { energy: 80, danceability: 85, valence: 72 },
  },
  Germany: {
    name: 'Germany',
    flag: '🇩🇪',
    vibe: 'Techno',
    vibeColor: 'hsl(0, 0%, 70%)',
    tracks: [
      { name: 'Sandstorm', artist: 'Darude', dotColor: dotColors[0] },
      { name: 'Autobahn', artist: 'Kraftwerk', dotColor: dotColors[1] },
      { name: 'Scary Monsters', artist: 'Boys Noize', dotColor: dotColors[2] },
      { name: 'One More Time', artist: 'Moderat', dotColor: dotColors[3] },
      { name: 'Strobe', artist: 'deadmau5', dotColor: dotColors[4] },
    ],
    mood: { energy: 90, danceability: 78, valence: 42 },
  },
  Australia: {
    name: 'Australia',
    flag: '🇦🇺',
    vibe: 'Chill',
    vibeColor: 'hsl(200, 60%, 50%)',
    tracks: [
      { name: 'The Less I Know', artist: 'Tame Impala', dotColor: dotColors[0] },
      { name: 'Somebody That I Used to Know', artist: 'Gotye', dotColor: dotColors[1] },
      { name: 'Electric Feel', artist: 'MGMT', dotColor: dotColors[2] },
      { name: 'Flume', artist: 'Bon Iver', dotColor: dotColors[3] },
      { name: 'Breathe', artist: 'Flume', dotColor: dotColors[4] },
    ],
    mood: { energy: 55, danceability: 62, valence: 60 },
  },
  'South Korea': {
    name: 'South Korea',
    flag: '🇰🇷',
    vibe: 'K-Pop',
    vibeColor: 'hsl(330, 90%, 65%)',
    tracks: [
      { name: 'Dynamite', artist: 'BTS', dotColor: dotColors[0] },
      { name: 'Pink Venom', artist: 'BLACKPINK', dotColor: dotColors[1] },
      { name: 'Super Shy', artist: 'NewJeans', dotColor: dotColors[2] },
      { name: 'LOVE DIVE', artist: 'IVE', dotColor: dotColors[3] },
      { name: 'Hype Boy', artist: 'NewJeans', dotColor: dotColors[4] },
    ],
    mood: { energy: 85, danceability: 90, valence: 80 },
  },
  'United Kingdom': {
    name: 'United Kingdom',
    flag: '🇬🇧',
    vibe: 'Indie',
    vibeColor: 'hsl(20, 70%, 50%)',
    tracks: [
      { name: 'Running Up That Hill', artist: 'Kate Bush', dotColor: dotColors[0] },
      { name: 'Heat Waves', artist: 'Glass Animals', dotColor: dotColors[1] },
      { name: 'Mr. Brightside', artist: 'The Killers', dotColor: dotColors[2] },
      { name: 'Easy On Me', artist: 'Adele', dotColor: dotColors[3] },
      { name: 'Unholy', artist: 'Sam Smith', dotColor: dotColors[4] },
    ],
    mood: { energy: 68, danceability: 58, valence: 48 },
  },
};

// Default data for countries not in the map
export const defaultCountryData: CountryMusicData = {
  name: '',
  flag: '🌍',
  vibe: 'Eclectic',
  vibeColor: 'hsl(240, 10%, 50%)',
  tracks: [
    { name: 'Local Groove #1', artist: 'Regional Artist', dotColor: dotColors[0] },
    { name: 'Folk Rhythm', artist: 'Traditional', dotColor: dotColors[1] },
    { name: 'City Nights', artist: 'Underground', dotColor: dotColors[2] },
    { name: 'Sunrise', artist: 'Ambient Collective', dotColor: dotColors[3] },
    { name: 'Heritage Beat', artist: 'Cultural Ensemble', dotColor: dotColors[4] },
  ],
  mood: { energy: 50, danceability: 50, valence: 50 },
};

export function getCountryData(name: string): CountryMusicData {
  const data = countryMusicMap[name] ?? { ...defaultCountryData, name };
  return data;
}
