import { Body, Controller, Get, Param, Post, Delete, Query, UseGuards } from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@Controller('bookings')
@UseGuards(JwtAuthGuard)
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Get('stats/occupancy')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  occupancy(@Query('roomId') roomId: string, @Query('days') days?: string) {
    return this.bookingsService.occupancyByDay(roomId, days ? Number(days) : undefined);
  }

  @Post()
  create(@CurrentUser() user: { userId: string }, @Body() dto: CreateBookingDto) {
    return this.bookingsService.create(user.userId, dto);
  }

  @Get()
  findMine(@CurrentUser() user: { userId: string }) {
    return this.bookingsService.findAllForUser(user.userId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.bookingsService.findOne(id);
  }

  @Delete(':id')
  cancel(@Param('id') id: string, @CurrentUser() user: { userId: string }) {
    return this.bookingsService.cancel(id, user.userId);
  }
}
