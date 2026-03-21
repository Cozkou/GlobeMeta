export interface MockTrack {
  title: string;
  artist: string;
}

export interface MockListener {
  id: string;
  lat: number;
  lng: number;
  label: string;
  tracks: MockTrack[];
}

/** Mock “listeners” placed around the world — click a dot to see what they’re playing */
export const HOME_MOCK_LISTENERS: MockListener[] = [
  {
    id: '1',
    lat: 40.7,
    lng: -74,
    label: 'New York',
    tracks: [
      { title: 'Midnight Metro', artist: 'Neon Transit' },
      { title: 'Bridge Lights', artist: 'Lena K.' },
    ],
  },
  {
    id: '2',
    lat: 51.5,
    lng: -0.12,
    label: 'London',
    tracks: [
      { title: 'Rain on the Thames', artist: 'The Grey Coats' },
      { title: 'Tube Line', artist: 'Ollie & The 4' },
    ],
  },
  {
    id: '3',
    lat: 35.7,
    lng: 139.7,
    label: 'Tokyo',
    tracks: [
      { title: 'Shibuya Crossing', artist: 'Yuki Sato' },
      { title: 'Neon Bloom', artist: 'Kairo' },
    ],
  },
  {
    id: '4',
    lat: -23.5,
    lng: -46.6,
    label: 'São Paulo',
    tracks: [
      { title: 'Samba Static', artist: 'DJ Alma' },
      { title: 'Avenida', artist: 'Banda Leste' },
    ],
  },
  {
    id: '5',
    lat: -33.9,
    lng: 151.2,
    label: 'Sydney',
    tracks: [
      { title: 'Harbour Echo', artist: 'Pacific Drift' },
      { title: 'Southern Cross', artist: 'Mira Lane' },
    ],
  },
  {
    id: '6',
    lat: 28.6,
    lng: 77.2,
    label: 'Delhi',
    tracks: [
      { title: 'Monsoon Tape', artist: 'Ravi & Keys' },
      { title: 'Old City Loop', artist: 'The Dhols' },
    ],
  },
  {
    id: '7',
    lat: 48.9,
    lng: 2.35,
    label: 'Paris',
    tracks: [
      { title: 'Café Steps', artist: 'Amélie Noir' },
      { title: 'Seine Blue', artist: 'Les Huit' },
    ],
  },
  {
    id: '8',
    lat: 55.8,
    lng: 37.6,
    label: 'Moscow',
    tracks: [
      { title: 'Snowline', artist: 'Nadia Frost' },
      { title: 'Metro 5', artist: 'Volk' },
    ],
  },
  {
    id: '9',
    lat: 19.4,
    lng: -99.1,
    label: 'Mexico City',
    tracks: [
      { title: 'Volcán', artist: 'Casa Norte' },
      { title: 'Zócalo Nights', artist: 'El Faro' },
    ],
  },
  {
    id: '10',
    lat: 1.35,
    lng: 103.8,
    label: 'Singapore',
    tracks: [
      { title: 'Garden City', artist: 'Jia Wei' },
      { title: 'Marina Pulse', artist: 'The Strait' },
    ],
  },
  {
    id: '11',
    lat: -26.2,
    lng: 28.0,
    label: 'Johannesburg',
    tracks: [
      { title: 'Highveld', artist: 'Thabo & Sons' },
      { title: 'Gold Rush', artist: 'DJ Mpho' },
    ],
  },
  {
    id: '12',
    lat: 59.3,
    lng: 18.1,
    label: 'Stockholm',
    tracks: [
      { title: 'Northern Lights', artist: 'Elsa Nord' },
      { title: 'Archipelago', artist: 'Vinter' },
    ],
  },
  {
    id: '13',
    lat: 25.2,
    lng: 55.3,
    label: 'Dubai',
    tracks: [
      { title: 'Desert Pulse', artist: 'Omar Ray' },
      { title: 'Skyline', artist: 'The Dunes' },
    ],
  },
  {
    id: '14',
    lat: -34.6,
    lng: -58.4,
    label: 'Buenos Aires',
    tracks: [
      { title: 'Tango Wire', artist: 'Sol M.' },
      { title: 'La Boca', artist: 'Orquesta Sur' },
    ],
  },
];
