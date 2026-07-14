import { Type } from 'class-transformer';
import { IsArray, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

export class QuoteOptionDto {
  @IsOptional()
  @IsString()
  label?: string;

  @IsNumber()
  @Min(0.01)
  price: number;
}

export class UpdateQuoteOptionsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuoteOptionDto)
  options: QuoteOptionDto[];
}
