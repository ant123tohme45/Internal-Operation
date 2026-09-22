import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Service } from '../service-requests/entities/service.entity';
import { getIntakeSuggestion } from './intake-ai.core';
import { INTAKE_AI_PROVIDER } from './intake-ai-provider.factory';
import { BoundedService, IntakeAiProvider, IntakeSuggestionResult } from './intake-ai.types';

/**
 * The Nest-wired half of the Request Intake AI capability. Everything that
 * actually decides whether free text becomes a suggestion lives in the
 * framework-free getIntakeSuggestion() (intake-ai.core.ts); this class's
 * only job is to supply it with the bounded context — read fresh from the
 * real database every call, never cached — and the configured provider.
 *
 * Reading services fresh here (rather than trusting a list a caller might
 * pass in) is a second, independent enforcement of "bounded to
 * product-owned values": even if something upstream were compromised, the
 * candidate this returns can never name a service this exact database
 * doesn't currently contain.
 */
@Injectable()
export class IntakeAiService {
  constructor(
    @InjectRepository(Service) private readonly services: Repository<Service>,
    @Inject(INTAKE_AI_PROVIDER) private readonly provider: IntakeAiProvider,
  ) {}

  async suggest(freeText: string): Promise<IntakeSuggestionResult> {
    const rows = await this.services.find();
    const bounded: BoundedService[] = rows.map((s) => ({
      id: s.id,
      name: s.name,
      departmentOwner: s.departmentOwner,
      category: s.category ?? undefined,
      keywords: s.keywords ?? undefined,
    }));

    return getIntakeSuggestion(freeText, bounded, this.provider);
  }
}
