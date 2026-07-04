import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { Seller, SellerSchema } from '../sellers/seller.schema';
import { SellerVerification, SellerVerificationSchema } from '../sellers/seller-verification.schema';
import { User, UserSchema } from '../users/user.schema';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { RolesGuard } from './roles.guard';

@Module({
  imports: [
    JwtModule.register({}),
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Seller.name, schema: SellerSchema },
      { name: SellerVerification.name, schema: SellerVerificationSchema },
    ]),
  ],
  controllers: [AuthController],
  providers: [AuthService, PasswordService, AuthGuard, RolesGuard],
  exports: [AuthService, AuthGuard, RolesGuard, PasswordService],
})
export class AuthModule {}
