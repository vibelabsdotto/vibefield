import { Module } from '@nestjs/common';
import { ProvidersModule } from './providers/providers.module';
import { DatabaseService } from './db/database.service';
import { ApiController } from './api.controller';
import { AssetsService } from './assets.service';
import { StudioService } from './studio.service';
import { SettingsService } from './settings.service';
import { CompilerService } from './compiler.service';
import { JobsService } from './jobs.service';
import { ExportService } from './export.service';

@Module({ imports: [ProvidersModule], controllers: [ApiController], providers: [DatabaseService, AssetsService, StudioService, SettingsService, CompilerService, JobsService, ExportService] })
export class AppModule {}
