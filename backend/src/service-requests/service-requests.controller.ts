import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ServiceRequestsService } from './service-requests.service';
import { RequestStatus } from './status-transitions';

interface CreateServiceRequestBody {
  employeeId: string;
  serviceId: string;
  comment?: string;
}

interface UpdateStatusBody {
  status: RequestStatus;
  changedBy: string;
  comment?: string;
}

@Controller('api/service-requests')
export class ServiceRequestsController {
  constructor(private readonly serviceRequests: ServiceRequestsService) {}

  /** Handles POST /api/service-requests — submit a new request. */
  @Post()
  create(@Body() body: CreateServiceRequestBody) {
    return this.serviceRequests.createRequest(body?.employeeId, body?.serviceId, body?.comment);
  }

  /** Handles GET /api/service-requests?employeeId=EMP-1 */
  @Get()
  findAll(@Query('employeeId') employeeId?: string) {
    return this.serviceRequests.findAll(employeeId);
  }

  /** Handles GET /api/service-requests/REQ-1001 */
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.serviceRequests.findOne(id);
  }

  /** Handles GET /api/service-requests/REQ-1001/history */
  @Get(':id/history')
  getHistory(@Param('id') id: string) {
    return this.serviceRequests.getHistory(id);
  }

  /** Handles PATCH /api/service-requests/REQ-1001/status — the state-transition endpoint. */
  @Patch(':id/status')
  changeStatus(@Param('id') id: string, @Body() body: UpdateStatusBody) {
    return this.serviceRequests.changeStatus(id, body?.status, body?.changedBy, body?.comment);
  }
}
