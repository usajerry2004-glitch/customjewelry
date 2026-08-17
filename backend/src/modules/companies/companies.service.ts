import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from '../../database/entities/company.entity';

@Injectable()
export class CompaniesService {
  constructor(
    @InjectRepository(Company) private readonly companyRepo: Repository<Company>,
  ) {}

  async findOne(id: string): Promise<Company> {
    const company = await this.companyRepo.findOne({ where: { id } });
    if (!company) throw new NotFoundException('Company not found');
    return company;
  }

  async toggleViewerAccess(id: string): Promise<Company> {
    const company = await this.findOne(id);
    company.viewerAccessEnabled = !company.viewerAccessEnabled;
    return this.companyRepo.save(company);
  }
}
