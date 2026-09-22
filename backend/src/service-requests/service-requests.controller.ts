import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ServiceRequestsService } from './service-requests.service';
import { RequestStatus } from './status-transitions';
import { CurrentEmployeeId } from './current-employee.decorator';
import { IntakeAiService } from '../ai/intake-ai.service';

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
  constructor(
    private readonly serviceRequests: ServiceRequestsService,
    private readonly intakeAi: IntakeAiService,
  ) {}

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

  /** Handles GET /api/service-requests/reference/services/search?q=&category=
   * — browse/search over the catalog (product-spec.md section 3; a Week
   * 2-3 gap closed in Week 4, see docs/week4-production-ai.md "Corrections
   * carried from Weeks 1-3"). Deliberately a distinct path from
   * `reference/services` above rather than an optional query param on it,
   * so the plain reference list (used for name look-ups elsewhere in the
   * frontend) always returns the full catalog regardless of what a search
   * box currently contains. */
  @Get('reference/services/search')
  searchServices(@Query('q') q?: string, @Query('category') category?: string) {
    return this.serviceRequests.searchServices(q, category);
  }

  /** Handles POST /api/service-requests/intake/suggest — the Week 4
   * AI-assisted Request Intake capability (docs/week4-production-ai.md).
   * Takes free text, returns at most one advisory candidate service, never
   * creates or modifies anything. No X-Employee-Id is required: this is a
   * read-only suggestion, not an action taken on anyone's behalf — the
   * employee still submits the actual request themselves through the
   * existing POST /api/service-requests, which independently validates
   * the serviceId regardless of whether it came from this endpoint or a
   * manual pick. Uses 200, not Nest's POST default of 201: nothing is
   * created, so there's no resource to report a 201 for. */
  @Post('intake/suggest')
  @HttpCode(200)
  suggestIntake(@Body() body: { text?: string }) {
    return this.intakeAi.suggest(body?.text ?? '');
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
