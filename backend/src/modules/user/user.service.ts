import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import User from './Models/userModel.js';

@Injectable()
export class UserService {
  constructor(@InjectModel(User) private readonly userModel: typeof User) {}

  create(data: {
    username: string;
    email: string;
    password: string | null;
    googleId?: string;
    emailVerified?: boolean;
  }) {
    return this.userModel.create(data);
  }

  findByEmail(email: string) {
    return this.userModel.findOne({ where: { email } });
  }

  findByGoogleId(googleId: string) {
    return this.userModel.findOne({ where: { googleId } });
  }

  findById(id: number) {
    return this.userModel.findByPk(id);
  }

  async markEmailVerified(user: User) {
    await user.update({ emailVerified: true });
  }

  // Signing in with Google proves the address belongs to this person. If the
  // account had never verified it, its password may have been chosen by
  // someone else who registered the address, so that password is removed.
  async linkGoogleAccount(user: User, googleId: string) {
    await user.update({
      googleId,
      emailVerified: true,
      ...(user.emailVerified ? {} : { password: null }),
    });
  }
}
