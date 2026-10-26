import { Module, DynamicModule, Type } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Webhook } from './entities/webhook.entity';
import { WebhookDeliveryFailure } from './entities/webhook-delivery-failure.entity';
import { WebhookOutboxEvent } from './entities/webhook-outbox-event.entity';
import { WebhookOutboxModule } from './webhook-outbox.module';
import { WebhookReconcilerService } from './webhook-reconciler.service';
import { Session } from '../session/entities/session.entity';
import { WebhookService } from './webhook.service';
import { WebhookDeliveryService } from './webhook-delivery.service';
import { WebhookRedriveService } from './webhook-redrive.service';
import { WebhookController } from './webhook.controller';
import { WebhooksListController } from './webhooks-list.controller';
import { EngineModule } from '../../engine/engine.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Webhook, WebhookDeliveryFailure, WebhookOutboxEvent, Session], 'data'),
    WebhookOutboxModule,
    EngineModule,
  ],
  controllers: [WebhookController, WebhooksListController],
  providers: [WebhookService, WebhookDeliveryService, WebhookReconcilerService, WebhookRedriveService],
  exports: [WebhookService],
})
export class WebhookModule {}
