import { Body, Controller, Get, Post, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AssistantService } from './assistant.service';

// Available to every logged-in role (customers and staff); the global
// JwtAuthGuard handles authentication and the service scopes order data.
@ApiTags('Assistant')
@ApiBearerAuth()
@Controller('assistant')
export class AssistantController {
  constructor(private readonly assistantService: AssistantService) {}

  @Get('status')
  status() {
    return { enabled: this.assistantService.isConfigured() };
  }

  // Tighter per-user limit than the global default — each call costs money.
  @Throttle({ default: { limit: 15, ttl: 60000 } })
  @Post('chat')
  chat(@Body() body: { messages: any }, @Request() req: any) {
    return this.assistantService.chat(body?.messages, req.user);
  }
}
