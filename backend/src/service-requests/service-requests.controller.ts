import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ServiceRequestsService } from './service-requests.service';
import { RequestStatus } from './status-transitions';
import { CurrentEmployeeId } from './current-employee.decorator';

interface CreateServiceRequestBody {
  serviceId: string;
  comment?: string;
}

interface CreateEmployeeBody {
  id: string;
  fullName: string;
  department: string;
}

interface CreateServiceBody {
  id: string;
  name: string;
  departmentOwner: string;
}

interface UpdateStatusBody {
  status: RequestStatus;
  comment?: string;
}

@Controller('api/service-requests')
export class ServiceRequestsController {
  constructor(private readonly serviceRequests: ServiceRequestsService) {}

  /** Handles GET /api/service-requests/reference/employees — for the
   * frontend's identity switcher (there is no login yet, see
   * docs/full-stack-delivery.md). */
  @Get('reference/employees')
  listEmployees() {
    return this.serviceRequests.listEmployees();
  }

  /** Handles GET /api/service-requests/reference/services — for the
   * frontend's "request a service" picker. */
  @Get('reference/services')
  listServices() {
    return this.serviceRequests.listServices();
  }

  /** Handles POST /api/service-requests/reference/employees — registers a
   * new employee so they can be selected in the identity switcher. */
  @Post('reference/employees')
  createEmployee(@Body() body: CreateEmployeeBody) {
    return this.serviceRequests.createEmployee(body?.id, body?.fullName, body?.department);
  }

  /** Handles POST /api/service-requests/reference/services — registers a
   * new service so it can be selected in the "request a service" picker. */
  @Post('reference/services')
  createService(@Body() body: CreateServiceBody) {
    return this.serviceRequests.createService(body?.id, body?.name, body?.departmentOwner);
  }

  /** Handles POST /api/service-requests — submit a new request, owned by
   * whoever the X-Employee-Id header says is acting. */
  @Post()
  create(
    @CurrentEmployeeId() employeeId: string,
    @Body() body: CreateServiceRequestBody,
  ) {
    return this.serviceRequests.createRequest(employeeId, body?.serviceId, body?.comment);
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

  /** Handles PATCH /api/service-requests/REQ-1001/status — the ops-team
   * state-transition endpoint. */
  @Patch(':id/status')
  changeStatus(
    @Param('id') id: string,
    @CurrentEmployeeId() changedBy: string,
    @Body() body: UpdateStatusBody,
  ) {
    return this.serviceRequests.changeStatus(id, body?.status, changedBy, body?.comment);
  }

  /** Handles PATCH /api/service-requests/REQ-1001/cancel — the Week 3 flow.
   * Owner-only (403 otherwise) and SUBMITTED-only (400 otherwise). */
  @Patch(':id/cancel')
  cancel(@Param('id') id: string, @CurrentEmployeeId() employeeId: string) {
    return this.serviceRequests.cancelRequest(id, employeeId);
  }
}
