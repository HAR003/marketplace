import {Body, Controller, Post} from "@nestjs/common";
import {AuthService} from "./auth.service.js";
import {RegisterDto} from "../../dtos/register.dto.js";


@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) {}

    @Post('register')
    async register(@Body() body: RegisterDto) {
        return this.authService.register(body)
    }
}