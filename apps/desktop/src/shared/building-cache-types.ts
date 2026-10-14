export type BuildingTileSource = 'openfreemap' | 'overture';

export interface BuildingBakeProgress {
  bakeId: string;
  source: BuildingTileSource;
  total: number;
  done: number;
  failed: number;
  bytes: number;
  status: 'running' | 'done' | 'cancelled' | 'error';
  error?: string;
}
