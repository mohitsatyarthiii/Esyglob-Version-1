import { Body, Controller, Get, Headers, Post, Req, UseGuards } from '@nestjs/common';
import { success } from '../common/api-response';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { AuthenticatedRequest } from './request.types';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  async login(@Body() body: unknown) {
    return success(await this.auth.login(body), 'Logged in successfully.');
  }
  
  @Post('signup')
  async signup(@Body() body: unknown) {
    return success(await this.auth.signup(body), 'Account created successfully.');
  }

  @Get('me')
  @UseGuards(AuthGuard)
  async me(@Req() request: AuthenticatedRequest) {
    return success(await this.auth.me(request.user.sub));
  }

  @Post('logout')
  async logout(@Headers('authorization') authorization: string | undefined) {
    return this.auth.logout(authorization);
  }

  @Post('forgot-password')
  async forgotPassword(@Body() body: unknown) {
    return success(await this.auth.forgotPassword(body), 'If the account exists, password reset instructions have been prepared.');
  }

  @Post('reset-password')
  async resetPassword(@Body() body: unknown) {
    return success(await this.auth.resetPassword(body), 'Password reset successfully.');
  }

  @Post('verify-email')
  async verifyEmail(@Body() body: unknown) {
    return success(await this.auth.verifyEmail(body), 'Email verified successfully.');
  }
}
