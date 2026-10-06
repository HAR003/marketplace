import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import User from './Models/userModel.js';
import { UserController } from './user.controller.js';
import { UserService } from './user.service.js';

@Module({
  imports: [SequelizeModule.forFeature([User])],
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
