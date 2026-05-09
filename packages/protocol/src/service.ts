export type ServiceName = 'gateway' | 'lobby' | 'game' | 'stats';

export interface HealthResponse {
  status: 'ok';
  service: ServiceName;
}
