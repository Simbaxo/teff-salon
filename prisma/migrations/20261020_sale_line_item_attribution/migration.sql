-- AlterTable
ALTER TABLE "SaleLineItem" ADD COLUMN     "appointmentId" INTEGER,
ADD COLUMN     "employeeId" INTEGER,
ADD COLUMN     "parentLineItemId" INTEGER;

-- CreateIndex
CREATE INDEX "SaleLineItem_saleId_idx" ON "SaleLineItem"("saleId");

-- CreateIndex
CREATE INDEX "SaleLineItem_employeeId_idx" ON "SaleLineItem"("employeeId");

-- CreateIndex
CREATE INDEX "SaleLineItem_appointmentId_idx" ON "SaleLineItem"("appointmentId");

-- CreateIndex
CREATE INDEX "SaleLineItem_parentLineItemId_idx" ON "SaleLineItem"("parentLineItemId");

-- AddForeignKey
ALTER TABLE "SaleLineItem" ADD CONSTRAINT "SaleLineItem_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleLineItem" ADD CONSTRAINT "SaleLineItem_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleLineItem" ADD CONSTRAINT "SaleLineItem_parentLineItemId_fkey" FOREIGN KEY ("parentLineItemId") REFERENCES "SaleLineItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
