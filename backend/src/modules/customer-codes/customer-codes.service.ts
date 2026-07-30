import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CustomerCode } from '../../database/entities/customer-code.entity';

@Injectable()
export class CustomerCodesService {
  constructor(
    @InjectRepository(CustomerCode) private readonly repo: Repository<CustomerCode>,
  ) {}

  findAll(): Promise<CustomerCode[]> {
    return this.repo.find({ order: { name: 'ASC' } });
  }
}
