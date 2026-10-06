import {Injectable} from "@nestjs/common";
import { JwtService as NestJwtService } from '@nestjs/jwt';

@Injectable()
export class JwtService {
    constructor(private readonly jwtService: NestJwtServic) {}

    generateAccessToken (userId: number) {
        return this.jwtService.sign(
          {
              sub: userId
          },
          {
              secret: process.env.JWT_ACCESS_SECRET
          }
        )
    }
}