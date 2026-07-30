import { IsOptional, IsString, IsNumber, IsEnum, IsIn, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { OrderStatus, Factory, SupplySource } from '../../../database/entities/order.entity';

export class OrderFilterDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() status?: OrderStatus;
  @IsOptional() @IsString() vendorName?: string;
  @IsOptional() @IsString() dateFrom?: string;
  @IsOptional() @IsString() dateTo?: string;
  @IsOptional() @IsString() cadSubFilter?: string;
  @IsOptional() @IsString() stoneSubFilter?: string;
  @IsOptional() @IsString() hasCustomerMessage?: string;
  @IsOptional() @IsIn(['asc', 'desc']) sortOrder?: 'asc' | 'desc';
  @IsOptional() @IsEnum(Factory) assignedFactory?: Factory;
  @IsOptional() @IsEnum(SupplySource) supplySource?: SupplySource;
  @IsOptional() @IsNumber() @Min(0) @Type(() => Number) offset?: number;
  @IsOptional() @IsNumber() @Min(1) @Type(() => Number) limit?: number;
}
