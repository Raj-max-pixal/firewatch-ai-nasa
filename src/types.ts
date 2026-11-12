export type Sensor = 'MODIS' | 'VIIRS';
export type DataSource = 'sample' | 'NASA FIRMS';

export type FireObservation = {
  id: string;
  latitude: number;
  longitude: number;
  acquired: string;
  satellite: Sensor;
  confidence: number;
  frp: number;
  region: string;
  source: DataSource;
  grid_cell?: string;
};
