import { IsOptional, IsString, IsNumber, IsIn, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { OrderStatus } from '../../../database/entities/order.entity';

export class OrderFilterDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() status?: OrderStatus;
  @IsOptional() @IsString() vendorName?: string;
  @IsOptional() @IsString() dateFrom?: string;
  @IsOptional() @IsString() dateTo?: string;
  @IsOptional() @IsString() cadSubFilter?: string;
  @IsOptional() @IsString() stoneSubFilter?: string;
  @IsOptional() @IsString() hasCustomerMessage?: string;
  // 'true' requests the Archived tab (projects closed via "Close Project" or
  // auto-archived after 30 days) instead of the normal status tabs — same
  // meaning on both the customer dashboard and the internal Orders list, see
  // OrdersService.applyArchiveScope.
  @IsOptional() @IsIn(['true', 'false']) archived?: string;
  @IsOptional() @IsIn(['asc', 'desc']) sortOrder?: 'asc' | 'desc';
  @IsOptional() @IsString() assignedFactory?: string;
  @IsOptional() @IsString() supplySource?: string;
  @IsOptional() @IsNumber() @Min(0) @Type(() => Number) offset?: number;
  @IsOptional() @IsNumber() @Min(1) @Type(() => Number) limit?: number;
}
