import { IsOptional, IsString, IsNumber, Min } from 'class-validator';
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
  @IsOptional() @IsNumber() @Min(0) @Type(() => Number) offset?: number;
  @IsOptional() @IsNumber() @Min(1) @Type(() => Number) limit?: number;
}
