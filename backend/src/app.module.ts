import { Module } from '@nestjs/common';
import { ServiceRequestsModule } from './service-requests/service-requests.module';

@Module({
  imports: [ServiceRequestsModule],
})
export class AppModule {}
