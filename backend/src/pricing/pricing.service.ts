import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConditionType } from '@prisma/client';

const DAY_NAMES = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

interface TimeOfDayCondition {
  from: string; // "HH:mm"
  to: string; // "HH:mm"
}

interface DayOfWeekCondition {
  days: string[]; // lowercase day names
}

/**
 * Week 3: dynamic pricing.
 *
 * final_price = base_price
 *   * product of matching time_of_day / day_of_week rule multipliers
 *   * demand multiplier (derived from occupancy % over a lookaround window)
 */
@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService) {}

  async calculatePrice(roomId: string, startTime: Date, endTime: Date): Promise<number> {
    const room = await this.prisma.room.findUniqueOrThrow({ where: { id: roomId } });
    const rules = await this.prisma.pricingRule.findMany({ where: { roomId } });

    let multiplier = 1;

    for (const rule of rules) {
      if (rule.conditionType === ConditionType.time_of_day) {
        if (this.matchesTimeOfDay(startTime, rule.condition as unknown as TimeOfDayCondition)) {
          multiplier *= Number(rule.multiplier);
        }
      } else if (rule.conditionType === ConditionType.day_of_week) {
        if (this.matchesDayOfWeek(startTime, rule.condition as unknown as DayOfWeekCondition)) {
          multiplier *= Number(rule.multiplier);
        }
      }
      // 'demand' rules are handled via computed occupancy below, not a static condition match.
    }

    const demandMultiplier = await this.calculateDemandMultiplier(roomId, startTime, endTime, rules);
    multiplier *= demandMultiplier;

    const finalPrice = Number(room.basePrice) * multiplier;
    return Math.round(finalPrice * 100) / 100;
  }

  private matchesTimeOfDay(start: Date, condition?: TimeOfDayCondition): boolean {
    if (!condition?.from || !condition?.to) return false;
    const minutes = start.getUTCHours() * 60 + start.getUTCMinutes();
    const [fromH, fromM] = condition.from.split(':').map(Number);
    const [toH, toM] = condition.to.split(':').map(Number);
    const from = fromH * 60 + fromM;
    const to = toH * 60 + toM;
    return from <= to ? minutes >= from && minutes < to : minutes >= from || minutes < to;
  }

  private matchesDayOfWeek(start: Date, condition?: DayOfWeekCondition): boolean {
    if (!condition?.days?.length) return false;
    const day = DAY_NAMES[start.getUTCDay()];
    return condition.days.map((d) => d.toLowerCase()).includes(day);
  }

  /**
   * Occupancy = % of bookings (pending/confirmed) for this room within the same
   * calendar day as the requested slot. Higher occupancy => higher demand multiplier.
   * Any pricing_rules row with condition_type = 'demand' supplies the multiplier
   * to apply once occupancy crosses 100% * (1 / multiplier's implied threshold);
   * here we use a simple tiered curve driven by the rule's multiplier as the "high demand" ceiling.
   */
  private async calculateDemandMultiplier(
    roomId: string,
    startTime: Date,
    endTime: Date,
    rules: { conditionType: ConditionType; multiplier: unknown }[],
  ): Promise<number> {
    const demandRule = rules.find((r) => r.conditionType === ConditionType.demand);
    if (!demandRule) return 1;

    const dayStart = new Date(startTime);
    dayStart.setUTCHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

    const SLOT_MINUTES = 60;
    const totalSlots = (dayEnd.getTime() - dayStart.getTime()) / (SLOT_MINUTES * 60 * 1000);

    const bookings = await this.prisma.booking.findMany({
      where: {
        roomId,
        status: { in: ['pending', 'confirmed'] },
        startTime: { lt: dayEnd },
        endTime: { gt: dayStart },
      },
    });

    const bookedMinutes = bookings.reduce((sum: number, b: { startTime: Date; endTime: Date }) => {
      const s = Math.max(b.startTime.getTime(), dayStart.getTime());
      const e = Math.min(b.endTime.getTime(), dayEnd.getTime());
      return sum + Math.max(0, e - s) / 60000;
    }, 0);

    const occupancyRatio = Math.min(1, bookedMinutes / (totalSlots * SLOT_MINUTES));
    const maxMultiplier = Number(demandRule.multiplier);

    // Linear interpolation: 0% occupancy -> 1x, 100% occupancy -> maxMultiplier
    return 1 + occupancyRatio * (maxMultiplier - 1);
  }
}
