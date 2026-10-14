import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../../shared/decorators/current-user.decorator';
import { Roles } from '../../../shared/decorators/roles.decorator';
import { Throttle } from '../../../shared/middleware/rate-limit.guard';
import { UserAdminService, type UserPage, type UserRow } from '../services/user-admin.service';
import {
  CreateUserDto,
  ListUsersDto,
  UpdateUserDto,
  UserIdsDto,
} from '../validation/user-admin.dto';

/** Every account, for administrators only. */
@Roles(Role.ADMINISTRATOR)
@Controller('admin/users')
export class UsersController {
  constructor(private readonly users: UserAdminService) {}

  @Get()
  list(@Query() query: ListUsersDto): Promise<UserPage> {
    return this.users.list(query);
  }

  /** A responder or an administrator. Sends them an SMS saying the account exists. */
  @Throttle(30, 3600)
  @Post()
  create(@Body() dto: CreateUserDto, @CurrentUser() user: AuthenticatedUser): Promise<UserRow> {
    return this.users.create(dto, user.userId);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserDto): Promise<UserRow> {
    return this.users.update(id, dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('deactivate')
  deactivate(
    @Body() dto: UserIdsDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ updated: number }> {
    return this.users.deactivate(dto.ids, user.userId);
  }

  @HttpCode(HttpStatus.OK)
  @Post('reactivate')
  reactivate(
    @Body() dto: UserIdsDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ updated: number }> {
    return this.users.reactivate(dto.ids, user.userId);
  }
}
