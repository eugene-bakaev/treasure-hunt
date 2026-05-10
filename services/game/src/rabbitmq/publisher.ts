import amqp from 'amqplib';
import type { MatchResultsMsg } from '@treasure-hunt/protocol';

export class RabbitMQPublisher {
  private connection: any = null;
  private channel: any = null;
  private readonly url: string;
  private readonly queueName = 'match.results';

  constructor(url: string) {
    this.url = url;
  }

  async connect(): Promise<void> {
    this.connection = await amqp.connect(this.url);
    this.channel = await this.connection.createChannel();
    await this.channel.assertQueue(this.queueName, { durable: true });
  }

  publishResults(results: MatchResultsMsg): void {
    if (!this.channel) {
      console.warn('[game] RabbitMQ channel not initialized — result not published');
      return;
    }
    const payload = Buffer.from(JSON.stringify(results));
    this.channel.sendToQueue(this.queueName, payload, { persistent: true });
  }

  async close(): Promise<void> {
    if (this.channel) {
      await this.channel.close();
    }
    if (this.connection) {
      await this.connection.close();
    }
  }
}
