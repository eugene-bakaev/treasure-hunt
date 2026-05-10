import { describe, it, expect, vi, beforeEach } from 'vitest';
import amqp from 'amqplib';
import { RabbitMQPublisher } from '../../src/rabbitmq/publisher.js';

vi.mock('amqplib');

describe('RabbitMQPublisher', () => {
  let publisher: RabbitMQPublisher;
  const mockUrl = 'amqp://localhost';
  const mockChannel = {
    assertQueue: vi.fn(),
    sendToQueue: vi.fn(),
    close: vi.fn(),
  };
  const mockConnection = {
    createChannel: vi.fn().mockResolvedValue(mockChannel),
    close: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (amqp.connect as any).mockResolvedValue(mockConnection);
    publisher = new RabbitMQPublisher(mockUrl);
  });

  it('connects to RabbitMQ and asserts the queue', async () => {
    await publisher.connect();

    expect(amqp.connect).toHaveBeenCalledWith(mockUrl);
    expect(mockConnection.createChannel).toHaveBeenCalled();
    expect(mockChannel.assertQueue).toHaveBeenCalledWith('match.results', { durable: true });
  });

  it('publishes results to the queue', async () => {
    await publisher.connect();
    const results = {
      matchId: 'match-1',
      durationSeconds: 120,
      players: [
        {
          playerId: 'p1',
          nickname: 'Alice',
          score: 100,
          treasuresFound: 1,
          nuggetsFound: 0,
        },
      ],
    };

    publisher.publishResults(results);

    expect(mockChannel.sendToQueue).toHaveBeenCalledWith(
      'match.results',
      expect.any(Buffer),
      { persistent: true }
    );

    const payload = JSON.parse(mockChannel.sendToQueue.mock.calls[0][1].toString());
    expect(payload).toEqual(results);
  });

  it('closes the connection', async () => {
    await publisher.connect();
    await publisher.close();

    expect(mockChannel.close).toHaveBeenCalled();
    expect(mockConnection.close).toHaveBeenCalled();
  });
});
