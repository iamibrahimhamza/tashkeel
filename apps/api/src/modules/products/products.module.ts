import { Module } from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";
import { ProductsController, PublicCoversController } from "./products.controller";
import { PublicDownloadsController } from "./public-downloads.controller";

/** Digital products: the expert's editor, file uploads, covers and the buyer's download links. */
@Module({
  controllers: [ProductsController, PublicCoversController, PublicDownloadsController],
  providers: [PrismaService],
})
export class ProductsModule {}
