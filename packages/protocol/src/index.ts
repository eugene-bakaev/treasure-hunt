// Phase 0 stub. Real WS message and event types arrive in Phase 1.

export type ServiceName = 'gateway' | 'lobby' | 'game' | 'stats';

export interface HealthResponse {
  status: 'ok';
  service: ServiceName;
}
