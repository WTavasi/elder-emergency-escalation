import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../../shared/decorators/current-user.decorator';
import { Roles } from '../../../shared/decorators/roles.decorator';
import { VolunteersService, type VolunteerApplication } from '../services/volunteers.service';
import { ListVolunteersDto, ReviewDto } from '../validation/volunteer.dto';

/** The vetting queue, for administrators. */
@Roles(Role.ADMINISTRATOR)
@Controller('admin/volunteers')
export class VolunteerAdminController {
  constructor(private readonly volunteers: VolunteersService) {}

  /** Waiting applications first, oldest at the top. `?status=` narrows it. */
  @Get()
  list(@Query() query: ListVolunteersDto): Promise<VolunteerApplication[]> {
    return this.volunteers.list(query.status);
  }

  /** Approve, reject or suspend, with a note the volunteer is sent. */
  @HttpCode(HttpStatus.OK)
  @Post(':id/review')
  review(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ReviewDto,
  ): Promise<VolunteerApplication> {
    return this.volunteers.review(id, user.userId, dto);
  }
}
