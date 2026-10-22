import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../../shared/decorators/current-user.decorator';
import { Roles } from '../../../shared/decorators/roles.decorator';
import { Throttle } from '../../../shared/middleware/rate-limit.guard';
import { VolunteerCallsService, type VolunteerCallView } from '../services/volunteer-calls.service';
import { VolunteersService, type VolunteerView } from '../services/volunteers.service';
import { ApplyDto, AvailabilityDto } from '../validation/volunteer.dto';

/** A community volunteer's own routes: their application, their availability, their calls. */
@Roles(Role.COMMUNITY_RESPONDER)
@Controller('volunteer')
export class VolunteerController {
  constructor(
    private readonly volunteers: VolunteersService,
    private readonly volunteerCalls: VolunteerCallsService,
  ) {}

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser): Promise<VolunteerView> {
    return this.volunteers.me(user.userId);
  }

  /** Send or change the application: training, a note, the home area and how far. */
  @Throttle(20, 3600)
  @Put('me')
  apply(@CurrentUser() user: AuthenticatedUser, @Body() dto: ApplyDto): Promise<VolunteerView> {
    return this.volunteers.apply(user.userId, dto);
  }

  /** "I'm available", or not. Only an approved volunteer can switch it on. */
  @Throttle(60, 3600)
  @Put('me/availability')
  availability(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AvailabilityDto,
  ): Promise<VolunteerView> {
    return this.volunteers.setAvailable(user.userId, dto.available);
  }

  /** The emergencies this volunteer was asked about, open ones first. */
  @Get('calls')
  calls(@CurrentUser() user: AuthenticatedUser): Promise<VolunteerCallView[]> {
    return this.volunteerCalls.mine(user.userId);
  }

  @Get('calls/:eventId')
  call(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<VolunteerCallView> {
    return this.volunteerCalls.one(eventId, user.userId);
  }

  /** "I can go." The first volunteer to say it is told who and where. */
  @HttpCode(HttpStatus.OK)
  @Post('calls/:eventId/accept')
  accept(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<VolunteerCallView> {
    return this.volunteerCalls.accept(eventId, user.userId);
  }

  @HttpCode(HttpStatus.OK)
  @Post('calls/:eventId/decline')
  decline(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<VolunteerCallView> {
    return this.volunteerCalls.decline(eventId, user.userId);
  }

  /** "I can no longer go." The others are asked again. */
  @HttpCode(HttpStatus.OK)
  @Post('calls/:eventId/withdraw')
  withdraw(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<VolunteerCallView> {
    return this.volunteerCalls.withdraw(eventId, user.userId);
  }

  @HttpCode(HttpStatus.OK)
  @Post('calls/:eventId/arrived')
  arrived(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<VolunteerCallView> {
    return this.volunteerCalls.arrived(eventId, user.userId);
  }
}
