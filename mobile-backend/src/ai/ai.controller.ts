import { Body, Controller, Delete, Get, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { success } from '../common/api-response';
import { AuthGuard } from '../auth/auth.guard';
import { AuthenticatedRequest } from '../auth/request.types';
import { AIService } from './ai.service';

@Controller('ai')
export class AIController {
  constructor(private readonly ai: AIService) {}

  @Get('chat')
  @UseGuards(AuthGuard)
  async chats(@Req() request: AuthenticatedRequest, @Query() query: { chatId?: string; role?: string }) {
    return this.ai.listChats(request.user.sub, query);
  }

  @Post('chat')
  @UseGuards(AuthGuard)
  async postChat(@Req() request: AuthenticatedRequest, @Body() body: Record<string, unknown>) {
    return this.ai.processChat(request.user.sub, body);
  }

  @Patch('chat')
  @UseGuards(AuthGuard)
  async patchChat(@Req() request: AuthenticatedRequest, @Body() body: { chatId?: string; title?: string; status?: string }) {
    return this.ai.patchChat(request.user.sub, body);
  }

  @Delete('chat')
  @UseGuards(AuthGuard)
  async deleteChat(@Req() request: AuthenticatedRequest, @Query('chatId') chatId?: string) {
    return this.ai.deleteChat(request.user.sub, chatId);
  }

  @Get('chat/stream')
  async streamStatus(@Query('status') status?: string) {
    if (status === 'true') {
      return success(await this.ai.providerStatus());
    }
    return success(await this.ai.providerStatus());
  }

  @Post('chat/stream')
  @UseGuards(AuthGuard)
  async streamChat(@Req() request: AuthenticatedRequest, @Body() body: Record<string, unknown>, @Res() response: any) {
    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');
    response.flushHeaders?.();

    try {
      const result = await this.ai.processChat(request.user.sub, body);
      const chat = result.chat as { _id?: unknown; id?: unknown };
      const chatId = String(chat._id ?? chat.id ?? '');
      this.writeEvent(response, { type: 'start', chatId });
      this.writeEvent(response, { type: 'typing' });

      const text = result.response.message;
      const tokens = text.match(/.{1,18}(\s|$)/g) ?? [text];
      for (const token of tokens) {
        this.writeEvent(response, { type: 'token', content: token });
      }

      this.writeEvent(response, {
        type: 'done',
        chatId,
        model: result.response.model,
        provider: result.response.provider,
        tokensUsed: result.response.tokensUsed,
      });
    } catch (error) {
      this.writeEvent(response, { type: 'error', message: error instanceof Error ? error.message : 'AI stream failed' });
    } finally {
      response.end();
    }
  }

  @Get('market-insights')
  @UseGuards(AuthGuard)
  async listReports(@Req() request: AuthenticatedRequest, @Query() query: { reportId?: string; reportType?: string }) {
    return this.ai.listMarketInsights(request.user.sub, query);
  }

  @Post('market-insights')
  @UseGuards(AuthGuard)
  async generateReport(@Req() request: AuthenticatedRequest, @Body() body: Record<string, unknown>) {
    return this.ai.generateMarketInsight(request.user.sub, body);
  }

  @Patch('market-insights')
  @UseGuards(AuthGuard)
  async patchReport(@Req() request: AuthenticatedRequest, @Body() body: { reportId?: string; title?: string; status?: string }) {
    return this.ai.patchMarketInsight(request.user.sub, body);
  }

  @Delete('market-insights')
  @UseGuards(AuthGuard)
  async deleteReport(@Req() request: AuthenticatedRequest, @Query('reportId') reportId?: string) {
    return this.ai.deleteMarketInsight(request.user.sub, reportId);
  }

  private writeEvent(response: any, payload: Record<string, unknown>) {
    response.write(`data: ${JSON.stringify(payload)}\n\n`);
  }
}
