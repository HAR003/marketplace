import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import User from './Models/userModel.js';

@Injectable()
export class UserService {
  constructor(@InjectModel(User) private readonly userModel: typeof User) {}

  create(data: { username: string; email: string; password: string }) {
    return this.userModel.create(data);
  }

  findByUsername(username: string) {
    return this.userModel.findOne({ where: { username } });
  }

  findById(id: number) {
    return this.userModel.findByPk(id);
  }

  async markEmailVerified(user: User) {
    await user.update({ emailVerified: true });
  }
}
