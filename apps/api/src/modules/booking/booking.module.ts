import { Module } from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";
import { PayModule } from "../pay/pay.module";
import { HoldsService } from "./holds.service";
import { PublicBookingController } from "./public-booking.controller";
import { ServicesController } from "./services.controller";

/** Consultations & booking: services, weekly availability, public slots, holds into checkout. */
@Module({
  imports: [PayModule],
  controllers: [ServicesController, PublicBookingController],
  providers: [PrismaService, HoldsService],
  exports: [HoldsService],
})
export class BookingModule {}
