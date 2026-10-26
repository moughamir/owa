import { Module } from '@nestjs/common';
import { InfraStatusController } from './infra-status.controller';
import { InfraConfigController } from './infra-config.controller';
import { InfraDataController } from './infra-data.controller';
import { InfraDataService } from './infra-data.service';
import { InfraStorageController } from './infra-storage.controller';
import { EngineModule } from '../../engine/engine.module';
import { DockerModule } from '../docker';
import { SessionModule } from '../session/session.module';

@Module({
  // SessionModule gives InfraDataService the live-engine registry for the import pre-flight
  // orphan check. Its own imports (WebhookModule, StatusStoreModule) never point back here — no cycle.
  // WaFine patch 1: QueueModule dropped (JOB-count reporting was @Optional).
  imports: [EngineModule, DockerModule, SessionModule],
  controllers: [InfraStatusController, InfraConfigController, InfraDataController, InfraStorageController],
  providers: [InfraDataService],
})
export class InfraModule {}
